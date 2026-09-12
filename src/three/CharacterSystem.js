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
 * CharacterSystem — personajes del pack `media/glTF`.
 *
 * El pack trae 11 personajes COMPLETOS (aventurero, playa, casual ×2, granjero,
 * rey, punk, traje, SWAT, obrero y astronauta), cada uno un `.glb` esqueletado
 * con CABEZA real (cara, pelo, ojos y cejas) y 24 animaciones propias (Idle,
 * Walk, Run, Interact, Wave…). Sustituyen al pack modular anterior, cuyos FBX
 * no incluían geometría de cabeza y obligaban a dibujar una esfera-ovoide con
 * la cara pintada encima (el "huevo con rostro").
 *
 * `scripts/gen-characters.mjs` empaqueta los `.gltf` como `.glb` y escribe
 * `config/characters.json`, el manifiesto que aquí se consume en caliente:
 * rutas, mapa de animaciones, materiales de piel y aspecto por defecto.
 *
 * El montaje es trivial comparado con el anterior: se carga el `.glb`, se clona
 * (para que cada personaje tenga su propia instancia de esqueleto y materiales)
 * y se reenlazan sus mallas esqueletadas a un esqueleto FRESCO construido con
 * los huesos clonados, heredando las `inverseBindMatrices` originales del GLB.
 * Las animaciones reales las reproduce `AnimatedEntity` vía `AnimationMixer`
 * (los clips se resuelven por nombre de hueso, que el clon conserva).
 *
 * Nota de skinning (leer antes de tocar el montaje): GLTFLoader enlaza las
 * mallas con `bindMatrix` = IDENTIDAD y `bindMode` "attached", de modo que en
 * el vertex shader la transformación de la malla se cancela con
 * `bindMatrixInverse` (= inversa de su matrixWorld) y la posición final de
 * cada vértice depende SÓLO de `boneMatrixWorld · boneInverse`. Las
 * `inverseBindMatrices` del GLB son por tanto la única referencia de espacio
 * del asset. Si el esqueleto compartido las recalcula
 * (`new Skeleton(bones)` → `calculateInverses`), la malla pierde esa
 * referencia y el personaje se dibuja con sus vértices "en bruto": tumbado en
 * el suelo, en Z-up y mal escalado. Por eso el esqueleto SIEMPRE hereda las
 * inverseBindMatrices del GLB base.
 *
 * Un "look" es un objeto plano y serializable:
 *   { character: '<id>', skin: 'dark'|'medium'|'light' }
 * El look del guardián jugable se persiste en localStorage. Los looks del pack
 * anterior ({ gender, outfit, variant, pauldrons, skin }) se migran al
 * personaje por defecto conservando el tono de piel.
 */

/* ------------------------------------------------------------------ constantes */
export const GUARDIAN_LOOK_KEY = 'gandia-guardian-look';

/** Manifiesto embebido (respaldo si `config/characters.json` no llega). */
export const DEFAULT_CHARACTERS_MANIFEST = {
  version: 2,
  characters: [],
  animations: { idle: 'Idle', walk: 'Walk', run: 'Run', talk: 'Interact', interact: 'Interact', wave: 'Wave' },
  skin: { materials: ['Skin', 'Skin_Darker'], tones: { dark: 0.78, medium: 1.0, light: 1.24 } },
  guardianDefault: { character: 'Adventurer', skin: 'medium' },
  fit: { height: 1.85, center: true, ground: 0 },
};

/* ------------------------------------------------------------------ estado */
let _manifest = null;

/** Vacía manifiesto y cachés (recargas en caliente y pruebas). */
export function resetCharacterSystem() {
  _manifest = null;
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
        guardianDefault: { ...DEFAULT_CHARACTERS_MANIFEST.guardianDefault, ...(json.guardianDefault ?? {}) },
      };
      return _manifest;
    }
  } catch { /* sin red: embebido */ }
  _manifest = DEFAULT_CHARACTERS_MANIFEST;
  return _manifest;
}

/* ------------------------------------------------------------------ look */
const SKINS = ['dark', 'medium', 'light'];

/**
 * Normaliza un look parcial contra los valores por defecto del guardián.
 * Acepta (y migra) el formato anterior del pack modular:
 * `{ gender, outfit, variant, pauldrons, skin }`.
 * @param {object} [look]
 * @returns {{character:string, skin:string}}
 */
export function normalizeLook(look = {}) {
  const src = look && typeof look === 'object' ? look : {};
  const def = DEFAULT_CHARACTERS_MANIFEST.guardianDefault;

  // Migración del look anterior (pack modular): conserva el tono de piel y
  // cae en el personaje por defecto, ya que las opciones viejas no existen.
  const legacy = !src.character && (src.outfit !== undefined || src.gender !== undefined || src.variant !== undefined);

  const character = (typeof src.character === 'string' && src.character.trim().length > 0)
    ? src.character.trim()
    : (legacy ? def.character : def.character);

  return {
    character,
    skin: SKINS.includes(src.skin) ? src.skin : def.skin,
  };
}

/** Clave compacta y estable de un look (para diagnóstico y persistencia). */
export function lookId(look) {
  const l = normalizeLook(look);
  return `${l.character}-${l.skin}`;
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

/* ------------------------------------------------------------------ montaje */

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
 * Resuelve el personaje del look contra el manifiesto. Si el id no existe
 * (look guardado de otra versión), cae al personaje por defecto y, en última
 * instancia, al primero declarado.
 */
function resolveCharacter(manifest, look) {
  const characters = manifest.characters ?? [];
  if (!characters.length) return null;
  return characters.find((c) => c.id === look.character)
    ?? characters.find((c) => c.id === normalizeLook().character)
    ?? characters[0];
}

/**
 * Aplica el tono de piel al personaje: tiñe los materiales declarados como
 * piel (p. ej. `Skin`, `Skin_Darker`) multiplicando su color base. Los
 * materiales se clonan para que cada personaje sea independiente.
 */
function applySkinTone(scene, tone, skinMaterials) {
  const names = new Set((skinMaterials ?? []).map((n) => n.toLowerCase()));
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (let i = 0; i < materials.length; i += 1) {
      const cloned = materials[i].clone();
      if (names.has((cloned.name ?? '').toLowerCase())) {
        cloned.color.multiplyScalar(tone);
      }
      if (cloned.emissive) cloned.emissive.set(0x000000);
      cloned.needsUpdate = true;
      materials[i] = cloned;
    }
    node.material = Array.isArray(node.material) ? materials : materials[0];
    node.castShadow = true;
    node.receiveShadow = false;
    node.frustumCulled = false;
  });
}

/**
 * Localiza la malla de la CABEZA del personaje: primero la que lleva rasgos
 * faciales (pelo/ojos/cejas/bigote/visor); si no, la que lleva material de
 * piel. Se usa para diagnóstico y pruebas: el personaje debe traer cara real,
 * no un ovoide.
 */
function findHeadMesh(meshes, skinMaterials) {
  const skinNames = new Set((skinMaterials ?? []).map((n) => n.toLowerCase()));
  const facial = /eye|hair|eyebrow|moustache|beard|visor/i;
  const materialNames = (mesh) => {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return mats.map((m) => (m.name ?? '').toLowerCase());
  };
  return meshes.find((mesh) => materialNames(mesh).some((name) => facial.test(name)))
    ?? meshes.find((mesh) => materialNames(mesh).some((name) => skinNames.has(name)))
    ?? meshes[0]
    ?? null;
}

/**
 * Monta un personaje completo a partir de un look.
 * Devuelve un grupo con los pies en y = 0, centrado y mirando a +Z, con el
 * tono de piel aplicado y las animaciones del asset listas para el mixer.
 * @param {object} look
 * @returns {Promise<{ group: THREE.Group, meshes: THREE.SkinnedMesh[],
 *   skeleton: THREE.Skeleton, head: THREE.Mesh|null, clips: THREE.AnimationClip[],
 *   animations: object, look: object, id: string, source: string }|null>}
 */
export async function assembleCharacter(look) {
  const normalized = normalizeLook(look);
  const manifest = await loadCharactersManifest();
  const def = resolveCharacter(manifest, normalized);
  if (!def) return null;

  const gltf = await loadModel(def.glb);
  if (!gltf || !firstSkinnedMesh(gltf.scene)) return null;

  // 1. Clonar la escena (huesos incluidos) y construir un esqueleto FRESCO
  //    con los huesos clonados. CRÍTICO: se heredan las inverseBindMatrices
  //    del GLB (la pose de enlace real) — ver la nota de skinning del módulo.
  const baseScene = gltf.scene.clone(true);
  baseScene.updateMatrixWorld(true, true);
  const baseSkin = firstSkinnedMesh(gltf.scene);
  const sourceOrder = baseSkin.skeleton.bones.map((bone) => bone.name);
  const sourceInverses = baseSkin.skeleton.boneInverses;
  const orderedBones = clonedBonesInOrder(baseScene, sourceOrder);
  if (orderedBones.length < sourceOrder.length) return null;

  const boneInverses = orderedBones.map((bone, i) => (
    sourceInverses[i]
      ? sourceInverses[i].clone()
      : new THREE.Matrix4().copy(bone.matrixWorld).invert()
  ));
  const skeleton = new THREE.Skeleton(orderedBones, boneInverses);
  const boneIndexByName = new Map(orderedBones.map((bone, i) => [bone.name, i]));

  // 2. Reenlazar cada malla al esqueleto compartido (orden de huesos idéntico
  //    → sin remapeo; se conserva por si acaso).
  const meshes = [];
  baseScene.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const remap = node.skeleton.bones.map((bone) => boneIndexByName.get(bone.name) ?? -1);
    if (remap.length !== skeleton.bones.length || remap.some((i) => i < 0)) {
      console.warn(`[GandiaRescue] Pieza "${node.name}" con esqueleto incompatible; se omite.`);
      return;
    }
    if (remap.some((index, i) => index !== i)) {
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
    meshes.push(node);
  });
  if (!meshes.length) return null;

  // 3. Tono de piel + saneado de materiales (clonados: independencia total).
  const tone = manifest.skin?.tones?.[normalized.skin] ?? 1;
  applySkinTone(baseScene, tone, manifest.skin?.materials);

  // 4. Normalizar al tamaño del juego (1.85 m, pies en el suelo, centrado).
  const fit = { ...(manifest.fit ?? {}), ...(def.fit ?? {}) };
  const holder = createFittedHolder(baseScene, fit);
  holder.pivot.updateMatrixWorld(true);

  const animations = { ...(manifest.animations ?? {}), ...(def.animations ?? {}) };
  const head = findHeadMesh(meshes, manifest.skin?.materials);
  const id = lookId(normalized);

  return {
    group: holder.pivot,
    meshes,
    skeleton,
    head,
    clips: gltf.animations ?? [],
    animations,
    look: normalized,
    id,
    source: `character:${id}`,
  };
}
