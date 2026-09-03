import * as THREE from 'three';
import { MATERIAL_SETTINGS, PROP_MODELS } from './WorldAssets.js';
import { createSurfaceMaterial } from './TextureFactory.js';
import { loadModel } from './ModelLoader.js';

/**
 * Biblioteca de atrezo del mundo 3D.
 *
 * Dos familias de objetos conviven aquí:
 *
 *  1. **Piezas singulares** (`.glb` generados por `scripts/gen-props.mjs`):
 *     faro, barco, torreta, alquería, colegiata, fuente, puente, pasarela y
 *     pantalán. Son geometría modelada; al cargarlos se sustituyen sus
 *     materiales nombrados (`wood`, `stone`, `tile`…) por los materiales
 *     texturizados con las imágenes adaptadas de `media/`.
 *
 *  2. **Atrezo instanciado**: rocas, cantos, mobiliario urbano, jardineras,
 *     sombrillas y cartelas de vegetación. Cada pieza es geometría modelada
 *     (con ruido de vértices, sombreado plano y varias partes) más un material
 *     con mapa, y se dibuja con `InstancedMesh` para no penalizar el
 *     rendimiento.
 *
 * Con esto desaparecen del escenario las primitivas sin textura (dodecaedros,
 * esferas y cilindros “en crudo”) que rompían la coherencia visual.
 */

/* ------------------------------------------------------------------ materiales */

/** Materiales “especiales” sin equivalente directo en el catálogo de mapas. */
const SPECIAL_MATERIALS = {
  glass: () => new THREE.MeshStandardMaterial({
    name: 'Gandia · glass',
    color: 0xbfe6f0,
    roughness: 0.12,
    metalness: 0.35,
    transparent: true,
    opacity: 0.55,
  }),
  water: () => new THREE.MeshStandardMaterial({
    name: 'Gandia · water',
    color: 0x3ab4c8,
    roughness: 0.18,
    metalness: 0.3,
    transparent: true,
    opacity: 0.85,
  }),
  beacon: () => new THREE.MeshStandardMaterial({
    name: 'Gandia · beacon',
    color: 0xffd27a,
    emissive: 0xffb703,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  }),
  lamp: () => new THREE.MeshStandardMaterial({
    name: 'Gandia · lamp',
    color: 0xfff3d6,
    emissive: 0xffe6a8,
    emissiveIntensity: 1.2,
    roughness: 0.3,
  }),
  rope: () => createSurfaceMaterial('wood', { color: 0xc0ae88, repeat: [2, 2] }),
  flag: () => createSurfaceMaterial('cloth', { color: 0xf06f3c, repeat: [1, 1] }),
};

const specialCache = new Map();

/**
 * Resuelve el material de una pieza modelada a partir del nombre que lleva en
 * el `.glb`. Si el nombre existe en el catálogo de materiales se usa su mapa;
 * en caso contrario se recurre a los materiales especiales o a `stone`.
 */
export function resolveSurfaceMaterial(name, overrides = {}) {
  const key = `${name}_${JSON.stringify(overrides)}`;
  if (specialCache.has(key)) return specialCache.get(key);

  let material;
  if (overrides[name]) {
    material = overrides[name];
  } else if (MATERIAL_SETTINGS[name]) {
    material = createSurfaceMaterial(name);
  } else if (SPECIAL_MATERIALS[name]) {
    material = SPECIAL_MATERIALS[name]();
  } else {
    material = createSurfaceMaterial('stone');
  }

  if (!overrides[name]) specialCache.set(key, material);
  return material;
}

/** Aplica a un modelo cargado los materiales texturizados del proyecto. */
export function applySurfaceMaterials(root, overrides = {}) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    node.material = materials.map((material) => resolveSurfaceMaterial(material?.name || 'stone', overrides));
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return root;
}

const modelCache = new Map();

/**
 * Carga un hito modelado (`.glb`) y devuelve una instancia lista para la
 * escena, con sus materiales ya texturizados.
 *
 * @param {keyof typeof PROP_MODELS} propId
 * @param {object} [options]
 * @param {Record<string, THREE.Material>} [options.materials] Sobrescrituras.
 * @param {number} [options.tint] Tinte global aplicado a los materiales con mapa.
 * @returns {Promise<THREE.Group|null>}
 */
export async function loadLandmark(propId, { materials: overrides = {}, tint } = {}) {
  const path = PROP_MODELS[propId];
  if (!path) return null;

  const cacheKey = `${propId}`;
  if (!modelCache.has(cacheKey)) {
    modelCache.set(cacheKey, loadModel(path).then((gltf) => (gltf?.scene ? gltf.scene : null)));
  }
  const source = await modelCache.get(cacheKey);
  if (!source) return null;

  const instance = source.clone(true);
  applySurfaceMaterials(instance, overrides);

  if (typeof tint === 'number') {
    instance.traverse((node) => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material?.color && !material.userData?.keepTint) material.color.multiply(new THREE.Color(tint));
      }
    });
  }

  return instance;
}

/* ------------------------------------------------------------------ geometría de atrezo */

/**
 * Alteración pseudoaleatoria de vértices: convierte una primitiva en una roca
 * o en un canto rodado irrepetible. Determinista (siempre la misma semilla da
 * la misma forma) para que el paisaje no cambie entre cargas.
 */
function roughen(geometry, amount, seed = 1, translate = null) {
  if (translate) geometry.translate(...translate);
  const pos = geometry.attributes.position;
  const seen = new Map();
  for (let i = 0; i < pos.count; i += 1) {
    const key = `${Math.round(pos.getX(i) * 100)}_${Math.round(pos.getY(i) * 100)}_${Math.round(pos.getZ(i) * 100)}`;
    let offset = seen.get(key);
    if (!offset) {
      const a = Math.sin(seed * 12.9898 + key.length * 7.233) * 43758.5453;
      const b = Math.sin(seed * 78.233 + key.length * 3.711) * 12345.6789;
      const c = Math.sin(seed * 39.425 + key.length * 9.151) * 24634.6345;
      offset = [(a - Math.floor(a)) - 0.5, (b - Math.floor(b)) - 0.5, (c - Math.floor(c)) - 0.5];
      seen.set(key, offset);
    }
    pos.setXYZ(
      i,
      pos.getX(i) + offset[0] * amount,
      pos.getY(i) + offset[1] * amount * 0.6,
      pos.getZ(i) + offset[2] * amount,
    );
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function shaped(geometry, { translate = null, rotate = null } = {}) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (rotate) flat.rotateX(rotate[0]), flat.rotateY(rotate[1]), flat.rotateZ(rotate[2]);
  if (translate) flat.translate(...translate);
  flat.computeVertexNormals();
  return flat;
}

/**
 * Catálogo de atrezo instanciado. Cada entrada define sus partes (geometría +
 * material) y, opcionalmente, el cilindro de colisión que registra en el
 * mundo para que la furgoneta no lo atraviese.
 */
export const PROP_TEMPLATES = Object.freeze({
  /* Rocas y cantos ---------------------------------------------------- */
  rock: {
    collide: { radius: 1.5, height: 2.2 },
    parts: [
      { geometry: () => roughen(new THREE.DodecahedronGeometry(1.25, 1), 0.42, 3), material: 'rock', scale: [1.15, 0.82, 1] },
    ],
  },
  boulder: {
    collide: { radius: 2.1, height: 3.0 },
    parts: [
      { geometry: () => roughen(new THREE.IcosahedronGeometry(1.9, 1), 0.55, 11), material: 'rock', scale: [1.1, 0.9, 1.05] },
    ],
  },
  pebble: {
    collide: null,
    parts: [
      { geometry: () => roughen(new THREE.DodecahedronGeometry(0.42, 0), 0.16, 23), material: 'gravel', scale: [1.2, 0.6, 1] },
    ],
  },
  riverStone: {
    collide: { radius: 0.8, height: 0.7 },
    parts: [
      { geometry: () => roughen(new THREE.IcosahedronGeometry(0.62, 1), 0.2, 31), material: 'gravel', scale: [1.25, 0.55, 1.05] },
    ],
  },

  /* Mobiliario urbano -------------------------------------------------- */
  streetLamp: {
    collide: { radius: 0.45, height: 5 },
    parts: [
      { geometry: () => shaped(new THREE.CylinderGeometry(0.34, 0.44, 0.5, 8), { translate: [0, 0.25, 0] }), material: 'stone' },
      { geometry: () => shaped(new THREE.CylinderGeometry(0.1, 0.16, 5, 7), { translate: [0, 2.7, 0] }), material: 'metal', tint: 0x2f3338 },
      { geometry: () => shaped(new THREE.BoxGeometry(0.14, 0.14, 1.1), { translate: [0, 5.1, 0.55] }), material: 'metal', tint: 0x2f3338 },
      { geometry: () => shaped(new THREE.CylinderGeometry(0.36, 0.22, 0.55, 6), { translate: [0, 4.85, 1.05] }), material: 'lamp' },
    ],
  },
  historicLamp: {
    collide: { radius: 0.5, height: 4.4 },
    parts: [
      { geometry: () => shaped(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 8), { translate: [0, 0.3, 0] }), material: 'stone' },
      { geometry: () => shaped(new THREE.CylinderGeometry(0.09, 0.14, 3.6, 8), { translate: [0, 2.4, 0] }), material: 'metal', tint: 0x1f2328 },
      { geometry: () => shaped(new THREE.TorusGeometry(0.42, 0.05, 5, 10, Math.PI), { translate: [0, 4.0, 0.3], rotate: [Math.PI / 2, 0, 0] }), material: 'metal', tint: 0x1f2328 },
      { geometry: () => shaped(new THREE.CylinderGeometry(0.3, 0.36, 0.7, 6), { translate: [0, 4.35, 0] }), material: 'glass' },
      { geometry: () => shaped(new THREE.ConeGeometry(0.42, 0.4, 6), { translate: [0, 4.85, 0] }), material: 'metal', tint: 0x1f2328 },
      { geometry: () => shaped(new THREE.SphereGeometry(0.16, 7, 5), { translate: [0, 4.35, 0] }), material: 'lamp' },
    ],
  },
  bollard: {
    collide: { radius: 0.35, height: 0.9 },
    parts: [
      { geometry: () => shaped(new THREE.CylinderGeometry(0.26, 0.32, 0.85, 8), { translate: [0, 0.42, 0] }), material: 'metal', tint: 0x33383d },
      { geometry: () => shaped(new THREE.SphereGeometry(0.27, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), { translate: [0, 0.85, 0] }), material: 'metal', tint: 0x33383d },
      { geometry: () => shaped(new THREE.TorusGeometry(0.17, 0.05, 5, 10), { translate: [0, 0.62, 0], rotate: [Math.PI / 2, 0, 0] }), material: 'rope' },
    ],
  },
  crate: {
    collide: { radius: 0.9, height: 1.4 },
    parts: [
      { geometry: () => shaped(new THREE.BoxGeometry(1.7, 1.3, 1.4), { translate: [0, 0.65, 0] }), material: 'wood' },
      { geometry: () => shaped(new THREE.BoxGeometry(1.78, 0.16, 1.48), { translate: [0, 1.1, 0] }), material: 'timber' },
      { geometry: () => shaped(new THREE.BoxGeometry(1.78, 0.16, 1.48), { translate: [0, 0.2, 0] }), material: 'timber' },
      { geometry: () => shaped(new THREE.BoxGeometry(0.16, 1.36, 1.44), { translate: [0.82, 0.65, 0] }), material: 'timber' },
      { geometry: () => shaped(new THREE.BoxGeometry(0.16, 1.36, 1.44), { translate: [-0.82, 0.65, 0] }), material: 'timber' },
    ],
  },
  fishBox: {
    collide: { radius: 0.6, height: 0.7 },
    parts: [
      { geometry: () => shaped(new THREE.BoxGeometry(1.0, 0.55, 0.75), { translate: [0, 0.28, 0] }), material: 'canvas', tint: 0x2f7f96 },
      { geometry: () => shaped(new THREE.BoxGeometry(1.06, 0.1, 0.81), { translate: [0, 0.56, 0] }), material: 'canvas', tint: 0x1f5f74 },
    ],
  },
  bench: {
    collide: { radius: 1.4, height: 1.1 },
    parts: [
      { geometry: () => shaped(new THREE.BoxGeometry(2.6, 0.16, 0.7), { translate: [0, 0.52, 0] }), material: 'wood' },
      { geometry: () => shaped(new THREE.BoxGeometry(2.6, 0.14, 0.62), { translate: [0, 0.66, 0] }), material: 'wood' },
      { geometry: () => shaped(new THREE.BoxGeometry(2.6, 0.5, 0.14), { translate: [0, 0.95, -0.3], rotate: [-0.18, 0, 0] }), material: 'timber' },
      { geometry: () => shaped(new THREE.BoxGeometry(0.18, 0.55, 0.6), { translate: [1.1, 0.27, 0] }), material: 'metal', tint: 0x30343a },
      { geometry: () => shaped(new THREE.BoxGeometry(0.18, 0.55, 0.6), { translate: [-1.1, 0.27, 0] }), material: 'metal', tint: 0x30343a },
    ],
  },
  planter: {
    collide: { radius: 1.0, height: 1.2 },
    parts: [
      { geometry: () => shaped(new THREE.CylinderGeometry(0.85, 0.6, 0.9, 10), { translate: [0, 0.45, 0] }), material: 'clay' },
      { geometry: () => shaped(new THREE.TorusGeometry(0.84, 0.1, 6, 12), { translate: [0, 0.9, 0], rotate: [Math.PI / 2, 0, 0] }), material: 'clay' },
      { geometry: () => shaped(new THREE.CylinderGeometry(0.78, 0.78, 0.1, 10), { translate: [0, 0.93, 0] }), material: 'earth' },
    ],
  },
  umbrella: {
    collide: { radius: 1.9, height: 2.6 },
    parts: [
      { geometry: () => shaped(new THREE.CylinderGeometry(0.07, 0.09, 2.5, 6), { translate: [0, 1.25, 0] }), material: 'wood', tint: 0xd9c9a8 },
      { geometry: () => shaped(new THREE.ConeGeometry(1.85, 0.75, 8), { translate: [0, 2.5, 0] }), material: 'cloth' },
      { geometry: () => shaped(new THREE.ConeGeometry(0.28, 0.3, 6), { translate: [0, 2.95, 0] }), material: 'timber' },
      { geometry: () => shaped(new THREE.CylinderGeometry(0.55, 0.65, 0.16, 8), { translate: [0, 0.08, 0] }), material: 'sand' },
    ],
  },
  signPost: {
    collide: { radius: 0.3, height: 2.4 },
    parts: [
      { geometry: () => shaped(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 6), { translate: [0, 1.15, 0] }), material: 'metal', tint: 0x4a5058 },
      { geometry: () => shaped(new THREE.BoxGeometry(0.9, 0.62, 0.08), { translate: [0, 2.1, 0] }), material: 'metal', tint: 0x2f6f4f },
    ],
  },
  dryStoneWall: {
    collide: { radius: 1.5, height: 1.5 },
    parts: [
      { geometry: () => roughen(new THREE.BoxGeometry(2.6, 1.1, 0.9, 3, 2, 2), 0.16, 17, [0, 0.55, 0]), material: 'stone' },
      { geometry: () => roughen(new THREE.BoxGeometry(1.3, 0.5, 0.75, 2, 1, 2), 0.14, 19, [0.5, 1.35, 0]), material: 'stone' },
    ],
  },
});

const templateCache = new Map();
/** Materiales teñidos derivados de los compartidos (se reutilizan entre zonas). */
const tintedCache = new Map();

/** Devuelve una variante teñida (y cacheada) del material de una pieza. */
function materialFor(part) {
  if (!part.tint) return part.material;
  const key = `${part.material?.name ?? 'mat'}_${part.tint}`;
  if (tintedCache.has(key)) return tintedCache.get(key);
  const tinted = part.material.clone();
  tinted.name = `${part.material.name} · tint ${part.tint.toString(16)}`;
  tinted.color.multiply(new THREE.Color(part.tint));
  tintedCache.set(key, tinted);
  return tinted;
}

/**
 * Devuelve (con caché) las partes ya resueltas de una pieza de atrezo:
 * geometría modelada + material texturizado.
 */
export function getPropTemplate(propId) {
  if (templateCache.has(propId)) return templateCache.get(propId);

  const template = PROP_TEMPLATES[propId];
  if (!template) {
    templateCache.set(propId, null);
    return null;
  }

  const resolved = {
    collide: template.collide ?? null,
    parts: template.parts.map((part) => ({
      geometry: part.geometry(),
      material: resolveSurfaceMaterial(part.material),
      tint: part.tint ?? null,
      translate: part.translate ?? null,
      scale: part.scale ?? null,
    })),
  };
  templateCache.set(propId, resolved);
  return resolved;
}

/**
 * Inserta una familia de atrezo modelado como `InstancedMesh` (una malla por
 * pieza) y devuelve la lista de mallas creadas.
 *
 * @param {string} propId clave de `PROP_TEMPLATES`
 * @param {{x:number,z:number,y?:number,scale?:number|number[],rotation?:number}[]} placements
 * @param {THREE.Group} group destino
 * @param {(x:number,z:number)=>number} heightAt altura del terreno
 * @param {() => boolean} [isCurrent] evita añadir piezas de una zona abandonada
 * @returns {THREE.InstancedMesh[]}
 */
export function addInstancedProp(propId, placements, group, heightAt, isCurrent = () => true) {
  const template = getPropTemplate(propId);
  if (!template || !placements?.length || !isCurrent()) return [];

  const meshes = [];
  const dummy = new THREE.Object3D();

  for (const part of template.parts) {
    const material = materialFor(part);
    const mesh = new THREE.InstancedMesh(part.geometry, material, placements.length);
    mesh.name = `Atrezo · ${propId}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.sharedProp = true;
    mesh.userData.propId = propId;

    placements.forEach((placement, index) => {
      const baseY = placement.y ?? heightAt(placement.x, placement.z);
      const instance = placement.scale ?? 1;
      const instanceScale = Array.isArray(instance) ? instance : [instance, instance, instance];
      // La escala de la pieza (p. ej. una roca achatada) se combina con la de
      // la instancia, y su desplazamiento local se escala igual.
      const shape = part.scale ?? [1, 1, 1];
      const offset = part.translate ?? [0, 0, 0];

      dummy.position.set(
        placement.x + offset[0] * instanceScale[0],
        baseY + offset[1] * instanceScale[1],
        placement.z + offset[2] * instanceScale[2],
      );
      dummy.rotation.set(0, placement.rotation ?? 0, 0);
      dummy.scale.set(
        instanceScale[0] * shape[0],
        instanceScale[1] * shape[1],
        instanceScale[2] * shape[2],
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  }

  return meshes;
}
