import * as THREE from 'three';
import { modelUrl, loadModel } from './ModelLoader.js';
import { createFittedHolder } from './ModelFitter.js';

/** Acceso tolerante a localStorage (independiente del resto de la app). */
const storage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  },
};

/**
 * CharacterSystem — personajes modulares del pack `media/Fantasy Character`.
 *
 * El pack trae 20 piezas FBX (cuerpo, brazos, piernas, pies, capucha y
 * hombreras × aldeano/guardabosques × masculino/femenino) que comparten el
 * mismo esqueleto UE de 65 huesos. `scripts/gen-characters.mjs` las convierte
 * a `.glb` (una skin de nombres limpios por pieza, geometría soldada) y adapta
 * sus texturas; el manifiesto resultante (`config/characters.json`) declara
 * piezas, materiales, variantes de color y tonos de piel.
 *
 * Aquí se montan en caliente: se cargan las piezas pedidas por el "look", se
 * reenlazan sus mallas esqueletadas a un esqueleto ÚNICO clonado de la primera
 * pieza (los 65 huesos comparten nombres y orden en todas las piezas) y se
 * visten con las texturas del manifiesto. Como los FBX no traen clips de
 * animación, el movimiento lo aporta la animación procedural de
 * `AnimatedEntity` (balanceo al andar, respiración en reposo…).
 *
 * Tres detalles del pack que condicionan el montaje:
 *   · La pose de reposo de los FBX es en T (brazos horizontales): aquí se
 *     relajan los hombros para que el personaje quede de pie con los brazos a
 *     los costados, que es la pose base sobre la que anima `AnimatedEntity`.
 *   · El pack NO trae cabeza de aldeano (ni modular ni en el outfit): los
 *     looks `peasant` reutilizan la cabeza con capucha ranger del mismo
 *     género para no quedar acéfalos.
 *   · Los materiales FBX traen `emissive` blanco: se neutraliza al vestir
 *     (si no, el personaje se ve blanquecino aunque las texturas carguen).
 *
 * Nota de skinning (leer antes de tocar el montaje): GLTFLoader enlaza las
 * mallas con `bindMatrix` = IDENTIDAD y `bindMode` "attached", de modo que en
 * el vertex shader la transformación de la malla se cancela con
 * `bindMatrixInverse` (= inversa de su matrixWorld) y la posición final de
 * cada vértice depende SÓLO de `boneMatrixWorld · boneInverse`. Las
 * `inverseBindMatrices` del GLB son por tanto la única referencia de espacio
 * del asset: GLTFExporter las escribió como `boneInverses · bindMatrix` (con
 * el envoltorio Z-up→Y-up incluido). Si el esqueleto compartido las
 * recalcula (`new Skeleton(bones)` → `calculateInverses`), la malla pierde esa
 * referencia y el personaje se dibuja con sus vértices "en bruto": tumbado en
 * el suelo, en Z-up y mal escalado (el bug del modelo tumbado). Por eso el
 * esqueleto compartido SIEMPRE hereda las inverseBindMatrices del GLB base.
 * Las mallas de otras piezas pueden colgarse de cualquier nodo (su
 * transformación se cancela): basta con apuntar su `skeleton` al esqueleto
 * compartido.
 *
 * Un "look" es un objeto plano y serializable:
 *   { gender: 'male'|'female', outfit: 'peasant'|'ranger',
 *     variant: 1|2, pauldrons: bool, skin: 'dark'|'medium'|'light' }
 * El look del guardián jugable se persiste en localStorage.
 */

/* ------------------------------------------------------------------ constantes */
export const GUARDIAN_LOOK_KEY = 'gandia-guardian-look';

/** Manifiesto embebido (respaldo si `config/characters.json` no llega). */
export const DEFAULT_CHARACTERS_MANIFEST = {
  version: 1,
  parts: [],
  materials: {},
  skin: { materials: ['MI_Regular_Male', 'MI_Regular_Female'], tones: { dark: 1, medium: 1.32, light: 1.62 } },
  guardianDefault: { gender: 'female', outfit: 'ranger', variant: 1, pauldrons: true, skin: 'medium' },
  fit: { height: 1.85, center: true, ground: 0 },
};

/** Colores de respaldo por material si las texturas no llegan a cargarse. */
const FALLBACK_COLORS = {
  MI_Peasant: 0x8a6a45,
  MI_Ranger: 0x46543f,
  MI_Regular_Male: 0xb98a63,
  MI_Regular_Female: 0xc69a74,
};

/* ------------------------------------------------------------------ estado */
let _manifest = null;
let _textureLoader = null;
/** Caché de texturas en promesa (una sola petición por URL aunque falle). */
const _textureCache = new Map();

/** Vacía manifiesto y cachés (recargas en caliente y pruebas). */
export function resetCharacterSystem() {
  _manifest = null;
  _textureCache.clear();
}

/**
 * Carga (y cachea) el manifiesto de personajes desde `config/characters.json`.
 * Si no está disponible (p. ej. en pruebas sin servidor), se usa el embebido.
 * @returns {Promise<object>}
 */
export async function loadCharactersManifest() {
  if (_manifest) return _manifest;
  try {
    const res = await fetch(modelUrl('config/characters.json'), { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      _manifest = {
        ...DEFAULT_CHARACTERS_MANIFEST,
        ...json,
        skin: { ...DEFAULT_CHARACTERS_MANIFEST.skin, ...(json.skin ?? {}) },
        fit: { ...DEFAULT_CHARACTERS_MANIFEST.fit, ...(json.fit ?? {}) },
      };
      return _manifest;
    }
  } catch { /* sin red: embebido */ }
  _manifest = DEFAULT_CHARACTERS_MANIFEST;
  return _manifest;
}

/* ------------------------------------------------------------------ look */
/**
 * Normaliza un look parcial contra los valores por defecto del guardián.
 * @param {object} [look]
 * @returns {{gender:string, outfit:string, variant:number, pauldrons:boolean, skin:string}}
 */
export function normalizeLook(look = {}) {
  const src = look && typeof look === 'object' ? look : {};
  const def = DEFAULT_CHARACTERS_MANIFEST.guardianDefault;
  return {
    gender: src.gender === 'male' || src.gender === 'female' ? src.gender : def.gender,
    outfit: src.outfit === 'peasant' || src.outfit === 'ranger' ? src.outfit : def.outfit,
    variant: Number(src.variant) === 2 ? 2 : 1,
    pauldrons: src.pauldrons !== false,
    skin: ['dark', 'medium', 'light'].includes(src.skin) ? src.skin : def.skin,
  };
}

/** Clave compacta y estable de un look (para diagnóstico y persistencia). */
export function lookId(look) {
  const l = normalizeLook(look);
  return `${l.gender}-${l.outfit}-v${l.variant}-${l.pauldrons ? 'p' : 'n'}-${l.skin}`;
}

/** Look por defecto del guardián (si el jugador no ha personalizado nada). */
export function defaultGuardianLook() {
  return normalizeLook(DEFAULT_CHARACTERS_MANIFEST.guardianDefault);
}

/** Lee el look del guardián desde localStorage (si no hay, el por defecto). */
export function loadGuardianLook() {
  try {
    const raw = storage.get(GUARDIAN_LOOK_KEY);
    if (raw) return normalizeLook(JSON.parse(raw));
  } catch { /* corrupto → por defecto */ }
  return defaultGuardianLook();
}

/** Persiste el look del guardián jugable. */
export function saveGuardianLook(look) {
  storage.set(GUARDIAN_LOOK_KEY, JSON.stringify(normalizeLook(look)));
}

/* ------------------------------------------------------------------ texturas */
/**
 * Carga una textura con tolerancia a fallos (si la URL no existe se resuelve
 * `null` y el material conserva su color de respaldo).
 * @param {string} url URL ya resuelta de la textura.
 * @returns {Promise<THREE.Texture|null>}
 */
function loadTextureSafe(url) {
  if (!url) return Promise.resolve(null);
  if (_textureCache.has(url)) return _textureCache.get(url);
  if (!_textureLoader) _textureLoader = new THREE.TextureLoader();

  const promise = new Promise((resolve) => {
    try {
      _textureLoader.load(url, resolve, undefined, () => resolve(null));
    } catch {
      resolve(null); // entornos sin cargador de imágenes (pruebas)
    }
  });
  _textureCache.set(url, promise);
  return promise;
}

/**
 * Viste un material a partir de su nombre (MI_Peasant, MI_Ranger,
 * MI_Regular_Male/Female) y del look activo: variante de color del tejido,
 * mapa de normales, ORM/rugosidad y tinte de piel.
 * @param {THREE.MeshStandardMaterial} material
 * @param {string} materialName
 * @param {object} look
 * @param {object} manifest
 */
function applyLookToMaterial(material, materialName, look, manifest) {
  // Los materiales del FBX traen `emissive` BLANCO (y los .glb antiguos lo
  // conservaron): sin esto el personaje se ve blanquecino/velado porque el
  // emissive suma luz blanca a cada píxel aunque el mapa de color cargue.
  if (material.emissive) material.emissive.set(0x000000);
  material.emissiveMap = null;
  if ('emissiveIntensity' in material) material.emissiveIntensity = 1;

  const cfg = manifest.materials?.[materialName];
  if (!cfg) {
    material.color.set(FALLBACK_COLORS[materialName] ?? 0xcccccc);
    material.needsUpdate = true;
    return;
  }

  const isSkin = manifest.skin?.materials?.includes(materialName) ?? false;
  if (isSkin) {
    // "Pieles": tinte multiplicativo sobre el atlas de piel del pack.
    material.color.setScalar(manifest.skin?.tones?.[look.skin] ?? 1);
  } else {
    material.color.set(cfg.fallbackColor ?? 0xffffff);
  }

  const entries = [];
  // Color base: la variante elegida del tejido (comparten UVs, normal y ORM).
  const base = cfg.variants?.length
    ? cfg.variants[(look.variant ?? 1) - 1] ?? cfg.variants[0]
    : cfg.map;
  if (base) entries.push({ url: modelUrl(base), slot: 'map', srgb: true });
  if (cfg.normal) entries.push({ url: modelUrl(cfg.normal), slot: 'normalMap', srgb: false });
  if (cfg.orm) {
    entries.push({ url: modelUrl(cfg.orm), slot: 'aoMap', srgb: false });
    entries.push({ url: modelUrl(cfg.orm), slot: 'roughnessMap', srgb: false });
    entries.push({ url: modelUrl(cfg.orm), slot: 'metalnessMap', srgb: false });
  }
  if (cfg.roughness) entries.push({ url: modelUrl(cfg.roughness), slot: 'roughnessMap', srgb: false });

  for (const entry of entries) {
    loadTextureSafe(entry.url).then((texture) => {
      if (!texture) return;
      texture.colorSpace = entry.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      // La geometría del pack tiene un único UV: el `aoMap` de three espera el
      // segundo por defecto (channel 1) y muestrearía basura sin esto.
      if ('channel' in texture) texture.channel = 0;
      texture.anisotropy = 4;
      material[entry.slot] = texture;
      if (entry.slot === 'normalMap') {
        // Las normales del pack siguen la convención DirectX de Unreal (Y+);
        // three espera OpenGL (Y−): se invierte el verde al vestir.
        material.normalScale.set(1, -1);
      }
      if (entry.slot === 'roughnessMap' || entry.slot === 'metalnessMap') {
        material.roughness = 1;
        material.metalness = 1;
      }
      if (entry.slot === 'aoMap') material.aoMapIntensity = 1;
      // El mapa de color ya trae el color real del tejido: se retira el tinte
      // de respaldo para no oscurecerlo (el tinte sólo debe verse si la
      // textura NO llega). La piel conserva su multiplicador de tono porque
      // su atlas base es deliberadamente oscuro.
      if (entry.slot === 'map' && !isSkin) material.color.set(0xffffff);
      material.needsUpdate = true;
    });
  }
}

/* ------------------------------------------------------------------ montaje */
/**
 * Contenedor que hay que rotar para mover un hueso del pack: cada hueso es
 * una hoja colgada de `hueso → X_2 → X_1` y la cadena cinemática vive en los
 * nodos `X_1`, así que se devuelve `X_1` (en rigs clásicos, el propio hueso).
 */
function containerForBone(skeleton, name) {
  const bone = skeleton?.getBoneByName?.(name);
  if (!bone) return null;
  const hasBoneChildren = bone.children.some((child) => child.isBone);
  if (hasBoneChildren) return bone;
  return bone.parent?.parent ?? bone.parent ?? null;
}

/* Reutilizables del posado (sin basura por llamada). */
const _relaxParentQuat = /*@__PURE__*/ new THREE.Quaternion();
const _relaxQuat = /*@__PURE__*/ new THREE.Quaternion();
const _relaxAxis = /*@__PURE__*/ new THREE.Vector3();
const _relaxA = /*@__PURE__*/ new THREE.Vector3();
const _relaxB = /*@__PURE__*/ new THREE.Vector3();
const _worldX = /*@__PURE__*/ new THREE.Vector3(1, 0, 0);
const _worldZ = /*@__PURE__*/ new THREE.Vector3(0, 0, 1);

/**
 * Gira un nodo del rig alrededor de un eje del MUNDO (X = izquierda-derecha,
 * Z = arriba-abajo del giro lateral). El eje se convierte al espacio del
 * padre y se PRE-multiplica (`Q · rest`): así el giro equivale a rotar la
 * pose de reposo en el mundo, sea cual sea la orientación de origen del
 * asset. Post-multiplicar (`rest · Q`) giraría alrededor de un eje ya
 * rotado por el reposo y, con los ~90-160° de este rig, las piernas se
 * moverían en direcciones extrañas.
 */
function rotateNodeAroundWorldAxis(node, axis, angle) {
  if (!node || !node.parent || !angle) return;
  node.parent.updateWorldMatrix(true, false);
  node.parent.getWorldQuaternion(_relaxParentQuat).invert();
  _relaxAxis.copy(axis).applyQuaternion(_relaxParentQuat).normalize();
  _relaxQuat.setFromAxisAngle(_relaxAxis, angle);
  node.quaternion.premultiply(_relaxQuat);
}

/**
 * Relaja los brazos del personaje: la pose de reposo del pack es en T
 * (brazos horizontales, 1.7-2.1 m de envergadura) y en el juego deben colgar
 * a los costados con los codos ligeramente flexionados. Es la pose base que
 * verán la previsualización, los NPC y el guardián, y sobre la que anima el
 * rig procedural de `AnimatedEntity`. Si los brazos ya cuelgan, no toca nada.
 * @param {THREE.Skeleton} skeleton Esqueleto compartido ya montado.
 */
function relaxCharacterArms(skeleton) {
  if (!skeleton?.bones?.length) return;
  let root = skeleton.bones[0];
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true, true);

  const ARM_DOWN = 1.35;   // ~77°: del horizontal a ~13° del costado
  const ARM_FORWARD = -0.06; // manos un poco por delante del torso
  const ELBOW_BEND = -0.18;  // codos ligeramente flexionados

  for (const side of ['l', 'r']) {
    const shoulder = skeleton.getBoneByName(`upperarm_${side}`);
    const hand = skeleton.getBoneByName(`hand_${side}`);
    const upperNode = containerForBone(skeleton, `upperarm_${side}`);
    if (!shoulder || !hand || !upperNode) continue;
    shoulder.getWorldPosition(_relaxA);
    hand.getWorldPosition(_relaxB);
    const dx = _relaxB.x - _relaxA.x;
    const dy = _relaxB.y - _relaxA.y;
    if (Math.abs(dy) > Math.abs(dx)) continue; // ya cuelga: no tocar
    const sign = dx >= 0 ? 1 : -1;
    rotateNodeAroundWorldAxis(upperNode, _worldZ, -sign * ARM_DOWN);
    rotateNodeAroundWorldAxis(upperNode, _worldX, ARM_FORWARD);
    rotateNodeAroundWorldAxis(containerForBone(skeleton, `lowerarm_${side}`), _worldX, ELBOW_BEND);
  }
  root.updateMatrixWorld(true, true);
}

/**
 * Piezas necesarias para un look (sin `acc` si no lleva hombreras).
 * @returns {Array<{gender:string, outfit:string, slot:string}>}
 */
export function partPlanForLook(look) {
  const l = normalizeLook(look);
  const slots = ['body', 'legs', 'feet', 'arms', 'head'];
  if (l.outfit === 'ranger' && l.pauldrons) slots.push('acc');
  return slots.map((slot) => ({ gender: l.gender, outfit: l.outfit, slot }));
}

/** Primera malla esqueletada de una escena (o null). */
function firstSkinnedMesh(object) {
  let found = null;
  object.traverse((node) => { if (!found && node.isSkinnedMesh) found = node; });
  return found;
}

/** Huesos de una escena clonada, ordenados según la skin de origen. */
function clonedBonesInOrder(clonedScene, sourceOrder) {
  const byName = new Map();
  clonedScene.traverse((node) => { if (node.isBone && !byName.has(node.name)) byName.set(node.name, node); });
  return sourceOrder.map((name) => byName.get(name)).filter(Boolean);
}

/**
 * Monta un personaje completo a partir de un look.
 * Devuelve un grupo con los pies en y = 0, centrado y mirando a +Z, con las
 * texturas aplicadas (se cargan en segundo plano si aún no están).
 * @param {object} look
 * @returns {Promise<{ group: THREE.Group, meshes: THREE.SkinnedMesh[],
 *   skeleton: THREE.Skeleton, look: object, id: string }|null>}
 */
export async function assembleCharacter(look) {
  const normalized = normalizeLook(look);
  const id = lookId(normalized);

  const manifest = await loadCharactersManifest();
  const parts = manifest.parts ?? [];
  const plan = partPlanForLook(normalized);
  const requested = plan.map(({ gender, outfit, slot }) => (
    parts.find((p) => p.gender === gender && p.outfit === outfit && p.slot === slot)
    // El pack no trae cabeza de aldeano: los looks `peasant` reutilizan la
    // cabeza con capucha ranger del mismo género (misma armadura) en vez de
    // quedar acéfalos. El fallback es genérico por si faltara otra pieza.
    ?? parts.find((p) => p.gender === gender && p.slot === slot)
  ));

  const loaded = await Promise.all(requested.map((part) => (part ? loadModel(part.glb) : Promise.resolve(null))));
  const usable = [];
  for (let i = 0; i < requested.length; i += 1) {
    if (requested[i] && loaded[i] && firstSkinnedMesh(loaded[i].scene)) {
      usable.push({ part: requested[i], gltf: loaded[i] });
    }
  }
  if (!usable.length) return null;

  // 1. Base: clonar la primera pieza y crear un esqueleto FRESCO con sus
  //    huesos clonados (el grafo conserva el envoltorio Z-up→Y-up del GLB, de
  //    modo que la pose de enlace es exactamente la original).
  //    CRÍTICO: el esqueleto compartido hereda las INVERSE BIND MATRICES del
  //    GLB (la verdadera pose de enlace del asset). No se deben recalcular:
  //    con `bindMatrix` identidad (GLTFLoader) son la única referencia de
  //    espacio que mantiene el personaje en pie; recalculándolas el render
  //    dibuja los vértices en crudo Z-up (modelo tumbado en el suelo).
  const base = usable[0];
  const baseScene = base.gltf.scene.clone(true);
  baseScene.updateMatrixWorld(true, true);
  const baseSkin = firstSkinnedMesh(base.gltf.scene);
  const sourceOrder = baseSkin.skeleton.bones.map((bone) => bone.name);
  const sourceInverses = baseSkin.skeleton.boneInverses;
  const orderedBones = clonedBonesInOrder(baseScene, sourceOrder);
  if (orderedBones.length < sourceOrder.length) return null;

  // ibm del GLB reordenadas a los huesos clonados (mismo orden por nombre);
  // si alguna faltara, se recalcula sólo ésa a partir de la pose actual.
  const boneInverses = orderedBones.map((bone, i) => (
    sourceInverses[i]
      ? sourceInverses[i].clone()
      : new THREE.Matrix4().copy(bone.matrixWorld).invert()
  ));
  const skeleton = new THREE.Skeleton(orderedBones, boneInverses);
  const boneIndexByName = new Map(orderedBones.map((bone, i) => [bone.name, i]));

  const group = new THREE.Group();
  group.name = `Character_${id}`;
  group.add(baseScene);

  // 2. Reenlazar cada malla al esqueleto compartido. En AttachedBindMode la
  //    transformación de la malla se cancela con bindMatrixInverse, así que
  //    basta con corregir `skinIndex` (orden idéntico → sin cambios) y colgar
  //    las mallas del grupo raíz.
  const meshes = [];
  const adopt = (scene) => {
    scene.updateMatrixWorld(true, true);
    const added = [];
    scene.traverse((node) => {
      if (!node.isSkinnedMesh) return;
      const remap = node.skeleton.bones.map((bone) => boneIndexByName.get(bone.name) ?? -1);
      if (remap.length !== skeleton.bones.length || remap.some((i) => i < 0)) {
        console.warn(`[GandiaRescue] Pieza "${node.name}" con esqueleto incompatible; se omite.`);
        return;
      }
      const needsRemap = remap.some((index, i) => index !== i);
      if (needsRemap) {
        const geometry = node.geometry.clone();
        const attr = geometry.attributes.skinIndex;
        for (let v = 0; v < attr.count; v += 1) {
          attr.setXYZW(v, remap[attr.getX(v)], remap[attr.getY(v)], remap[attr.getZ(v)], remap[attr.getW(v)]);
        }
        attr.needsUpdate = true;
        node.geometry = geometry;
      }
      node.skeleton = skeleton;
      node.castShadow = true;
      node.receiveShadow = false;
      node.frustumCulled = false;
      added.push(node);
    });
    return added;
  };

  // La pieza base queda en su grafo original; el resto cuelga del nodo de la
  // armadura (dentro del envoltorio Z-up→Y-up), así todas las mallas viven en
  // el mismo espacio que los huesos y las mediciones de caja son correctas.
  const armature = skeleton.bones[0].parent ?? group;
  for (const mesh of adopt(baseScene)) meshes.push(mesh);
  for (let i = 1; i < usable.length; i += 1) {
    const clone = usable[i].gltf.scene.clone(true);
    for (const mesh of adopt(clone)) {
      mesh.parent?.remove(mesh);
      armature.add(mesh);
      meshes.push(mesh);
    }
  }

  // 3. Vestir cada malla (materiales clonados: cada personaje es independiente).
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let m = 0; m < materials.length; m += 1) {
      const cloned = materials[m].clone();
      applyLookToMaterial(cloned, cloned.name, normalized, manifest);
      materials[m] = cloned;
    }
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
  }

  // 3b. Relajar los brazos (la pose del FBX es en T): quedan colgando a los
  //     costados con los codos algo flexionados. Se hace ANTES del ajuste de
  //     tamaño para que la caja se mida ya en pose natural.
  relaxCharacterArms(skeleton);

  // 4. Normalizar al tamaño del juego (1.85 m, pies en el suelo, centrado).
  const fit = manifest.fit ?? { height: 1.85, center: true, ground: 0 };
  const holder = createFittedHolder(group, fit);

  // 5. Refrescar la jerarquía final: en "attached" la bindMatrixInverse de
  //    cada malla se actualiza aquí igual que hace el renderizador del
  //    navegador antes de dibujar. Así cualquier medición posterior (cajas,
  //    pruebas, colisiones) coincide EXACTAMENTE con lo que se ve en pantalla.
  holder.pivot.updateMatrixWorld(true);

  return {
    group: holder.pivot,
    meshes,
    skeleton,
    look: normalized,
    id,
    source: `character:${id}`,
  };
}
