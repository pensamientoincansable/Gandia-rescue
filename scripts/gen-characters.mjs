/**
 * Genera los recursos del sistema de personajes desde `media/Fantasy Character`:
 *   1. Convierte las 20 piezas modulares FBX (cuerpo, brazos, piernas, pies,
 *      capucha y hombreras de aldeano/guardabosques × masculino/femenino) a
 *      `.glb` esqueletados en `public/models/characters/parts/`. Todas las
 *      piezas comparten el mismo esqueleto UE (65 huesos, mismos nombres),
 *      así que en tiempo de ejecución se pueden combinar a voluntad.
 *   2. Adapta las texturas del pack (4096/2048 px → 1024/512 px) a
 *      `public/models/characters/textures/` usando el decodificador PNG propio.
 *   3. Escribe `public/config/characters.json`, el manifiesto que el juego
 *      consume en caliente (piezas, materiales, variantes de color, tonos de
 *      piel y aspecto por defecto del guardián).
 *
 * Los FBX referencian texturas por rutas absolutas de Windows (no resueltas
 * aquí): la relación material → textura se aplica en runtime según el
 * manifiesto, no desde el asset. Los materiales se exportan nombrados
 * (MI_Peasant, MI_Ranger, MI_Regular_Male/Female) para poder vestirlos.
 *
 * Uso:
 *   node scripts/gen-characters.mjs        # o npm run assets:characters
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptPng } from './lib/png.mjs';

/* ------------------------------------------------------------------ polyfills */
// El GLTFExporter usa Blob y FileReader (API de navegador). En Node se
// resuelven igual que en scripts/gen-models.mjs.
if (typeof globalThis.Blob === 'undefined') {
  const { Blob: NodeBlob } = await import('node:buffer');
  globalThis.Blob = NodeBlob;
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); });
    }
  };
}

// El FBXLoader intenta cargar sus texturas referenciadas (rutas de Windows que
// no existen aquí). Un `document` mínimo hace que la carga de imágenes falle
// con elegancia: los materiales se exportan sin mapas y las texturas se
// aplican en runtime.
function fakeImage() {
  const img = { crossOrigin: '', _listeners: {} };
  img.addEventListener = (type, fn) => { (img._listeners[type] ??= []).push(fn); };
  img.removeEventListener = () => {};
  Object.defineProperty(img, 'src', {
    set() { queueMicrotask(() => (img._listeners.error ?? []).forEach((fn) => fn({}))); },
  });
  return img;
}
globalThis.document = { createElementNS: () => fakeImage() };

/* ------------------------------------------------------------------ rutas */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PARTS = join(root, 'media/Fantasy Character/Modular Parts');
const SRC_TEX = join(root, 'media/Fantasy Character/textures');
const PARTS_DIR = join(root, 'public/models/characters/parts');
const TEX_DIR = join(root, 'public/models/characters/textures');
const CONFIG_PATH = join(root, 'public/config/characters.json');

/* ------------------------------------------------------------------ config */
/**
 * Relación material → texturas del pack (verificada contra las referencias
 * embebidas en los FBX). Las variantes de color comparten UVs, normal y ORM.
 * Los colores de respaldo se usan si alguna textura no llega a cargarse.
 */
const MATERIALS = {
  MI_Peasant: {
    variants: ['models/characters/textures/peasant/T_Peasant_BaseColor.png', 'models/characters/textures/peasant/T_Peasant_2_BaseColor.png'],
    normal: 'models/characters/textures/peasant/T_Peasant_Normal.png',
    orm: 'models/characters/textures/peasant/T_Peasant_ORM.png',
    fallbackColor: '#8a6a45',
  },
  MI_Ranger: {
    variants: ['models/characters/textures/ranger/T_Ranger_BaseColor.png', 'models/characters/textures/ranger/T_Ranger_3_BaseColor.png'],
    normal: 'models/characters/textures/ranger/T_Ranger_Normal.png',
    orm: 'models/characters/textures/ranger/T_Ranger_ORM.png',
    fallbackColor: '#46543f',
  },
  MI_Regular_Male: {
    map: 'models/characters/textures/base/T_Regular_Male_Dark_BaseColor.png',
    normal: 'models/characters/textures/base/T_Regular_Male_Normal.png',
    roughness: 'models/characters/textures/base/T_Regular_Male_Roughness.png',
    fallbackColor: '#b98a63',
  },
  MI_Regular_Female: {
    map: 'models/characters/textures/base/T_Regular_Female_Dark_BaseColor.png',
    normal: 'models/characters/textures/base/T_Regular_Female_Normal.png',
    roughness: 'models/characters/textures/base/T_Regular_Female_Roughness.png',
    fallbackColor: '#c69a74',
  },
};

/** Texturas originales → carpeta destino + tamaño de adaptación. */
const TEXTURE_PLAN = [
  // Base Chars (piel): basecolor y normal a 1024, rugosidad a 512.
  { from: 'Base Chars/T_Regular_Male_Dark_BaseColor.png', to: 'base/T_Regular_Male_Dark_BaseColor.png', size: 1024 },
  { from: 'Base Chars/T_Regular_Male_Normal.png', to: 'base/T_Regular_Male_Normal.png', size: 1024 },
  { from: 'Base Chars/T_Regular_Male_Roughness.png', to: 'base/T_Regular_Male_Roughness.png', size: 512 },
  { from: 'Base Chars/T_Regular_Female_Dark_BaseColor.png', to: 'base/T_Regular_Female_Dark_BaseColor.png', size: 1024 },
  { from: 'Base Chars/T_Regular_Female_Normal.png', to: 'base/T_Regular_Female_Normal.png', size: 1024 },
  { from: 'Base Chars/T_Regular_Female_Roughness.png', to: 'base/T_Regular_Female_Roughness.png', size: 512 },
  // Peasant (aldeano): atlas 4096 → 1024, ORM a 512.
  { from: 'Peasant/T_Peasant_BaseColor.png', to: 'peasant/T_Peasant_BaseColor.png', size: 1024 },
  { from: 'Peasant/T_Peasant_2_BaseColor.png', to: 'peasant/T_Peasant_2_BaseColor.png', size: 1024 },
  { from: 'Peasant/T_Peasant_Normal.png', to: 'peasant/T_Peasant_Normal.png', size: 1024 },
  { from: 'Peasant/T_Peasant_ORM.png', to: 'peasant/T_Peasant_ORM.png', size: 512 },
  // Ranger (guardabosques): ídem.
  { from: 'Ranger/T_Ranger_BaseColor.png', to: 'ranger/T_Ranger_BaseColor.png', size: 1024 },
  { from: 'Ranger/T_Ranger_3_BaseColor.png', to: 'ranger/T_Ranger_3_BaseColor.png', size: 1024 },
  { from: 'Ranger/T_Ranger_Normal.png', to: 'ranger/T_Ranger_Normal.png', size: 1024 },
  { from: 'Ranger/T_Ranger_ORM.png', to: 'ranger/T_Ranger_ORM.png', size: 512 },
];

/** Aspecto por defecto del guardián jugable (usado si no hay personalización). */
const GUARDIAN_DEFAULT_LOOK = { gender: 'female', outfit: 'ranger', variant: 1, pauldrons: true, skin: 'medium' };

/* ------------------------------------------------------------------ utilidades */

/** Carga y parsea un FBX binario sin intentar resolver sus texturas. */
async function parseFbx(path) {
  const bytes = readFileSync(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new FBXLoader().parse(buffer, path);
}

/**
 * Optimiza la geometría antes de exportar:
 *  · FBXLoader entrega geometría NO indexada (un vértice por esquina de
 *    triángulo) con un atributo `color` redundante: se sueldan los vértices
 *    idénticos (posición + normal + UV cuantizados) y se genera el índice.
 *    Los pesos de skinning se copian del primer vértice de cada grupo: en FBX
 *    viven por punto de control, así que vértices coincidentes comparten pesos.
 *  · `skinIndex` pasa a Uint16 (GLTFExporter lo escribe como unsigned short).
 */
function weldGeometry(geometry) {
  const src = {
    position: geometry.attributes.position,
    normal: geometry.attributes.normal,
    uv: geometry.attributes.uv,
    skinIndex: geometry.attributes.skinIndex,
    skinWeight: geometry.attributes.skinWeight,
  };
  const vertCount = src.position.count;
  if (!vertCount) return geometry;

  const quant = (v) => Math.round(v * 1e4) / 1e4;
  const map = new Map();
  const index = [];
  const out = {
    position: [],
    normal: [],
    uv: [],
    skinIndex: [],
    skinWeight: [],
  };
  let next = 0;
  for (let i = 0; i < vertCount; i += 1) {
    const key = `${quant(src.position.getX(i))},${quant(src.position.getY(i))},${quant(src.position.getZ(i))}`
      + `|${quant(src.normal.getX(i))},${quant(src.normal.getY(i))},${quant(src.normal.getZ(i))}`
      + `|${quant(src.uv.getX(i))},${quant(src.uv.getY(i))}`;
    const existing = map.get(key);
    if (existing !== undefined) {
      index.push(existing);
      continue;
    }
    map.set(key, next);
    index.push(next);
    out.position.push(src.position.getX(i), src.position.getY(i), src.position.getZ(i));
    out.normal.push(src.normal.getX(i), src.normal.getY(i), src.normal.getZ(i));
    out.uv.push(src.uv.getX(i), src.uv.getY(i));
    if (src.skinIndex) out.skinIndex.push(src.skinIndex.getX(i), src.skinIndex.getY(i), src.skinIndex.getZ(i), src.skinIndex.getW(i));
    if (src.skinWeight) out.skinWeight.push(src.skinWeight.getX(i), src.skinWeight.getY(i), src.skinWeight.getZ(i), src.skinWeight.getW(i));
    next += 1;
  }

  const welded = new THREE.BufferGeometry();
  welded.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  welded.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  welded.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  if (src.skinIndex) welded.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.skinIndex, 4));
  if (src.skinWeight) welded.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.skinWeight, 4));
  welded.setIndex(index);
  // Los grupos de materiales (varias texturas por malla) se conservan: el
  // orden de vértices no cambia, así que sus rangos siguen siendo válidos.
  for (const group of geometry.groups) welded.addGroup(group.start, group.count, group.materialIndex);
  return welded;
}

function optimizeObject(object) {
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry = weldGeometry(node.geometry);
  });
}

/** Elimina los mapas de textura rotos antes de exportar a GLB. */
function stripTextures(object) {
  object.traverse((node) => {
    if (!node.isMesh) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      mat.map = null;
      mat.normalMap = null;
      mat.roughnessMap = null;
      mat.metalnessMap = null;
      mat.aoMap = null;
      mat.bumpMap = null;
      mat.emissiveMap = null;
      mat.alphaMap = null;
      mat.needsUpdate = true;
    }
  });
}

/**
 * Unifica el esqueleto de todas las mallas esqueletadas de una pieza.
 * FBXLoader crea una instancia de `Skeleton` por malla; si exportamos así,
 * GLTFExporter escribe una skin por instancia y renombra los huesos de la
 * segunda (`root_1`, `pelvis_1`…), rompiendo el montaje modular por nombre.
 * Aquí todas las mallas se reenlazan a la primera instancia (los huesos
 * comparten nombres y orden), de modo que cada .glb sale con UNA skin de
 * nombres limpios.
 */
function canonicalizeSkeleton(object) {
  const skinned = [];
  object.traverse((node) => { if (node.isSkinnedMesh) skinned.push(node); });
  if (skinned.length < 2) return skinned[0]?.skeleton ?? null;

  const canon = skinned[0].skeleton;
  const canonNames = canon.bones.map((bone) => bone.name);
  for (const mesh of skinned) {
    if (mesh.skeleton === canon) continue;
    const names = mesh.skeleton.bones.map((bone) => bone.name);
    if (names.length !== canonNames.length) {
      throw new Error(`Esqueletos incompatibles dentro de la pieza (${names.length} ≠ ${canonNames.length} huesos).`);
    }
    const remap = names.map((name) => canonNames.indexOf(name));
    if (remap.some((i) => i < 0)) throw new Error('Hueso sin correspondencia en el esqueleto canónico.');
    const needsRemap = remap.some((index, i) => index !== i);
    if (needsRemap) {
      const attr = mesh.geometry.attributes.skinIndex;
      for (let v = 0; v < attr.count; v += 1) {
        attr.setXYZW(v, remap[attr.getX(v)], remap[attr.getY(v)], remap[attr.getZ(v)], remap[attr.getW(v)]);
      }
      attr.needsUpdate = true;
    }
    mesh.skeleton = canon;
  }
  return canon;
}

/** Exporta un objeto a .glb binario. */
function exportGlb(object, file) {
  return new Promise((resolvePromise, rejectPromise) => {
    new GLTFExporter().parse(
      object,
      (result) => {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, Buffer.from(result));
        resolvePromise(file);
      },
      (err) => rejectPromise(err),
      { binary: true },
    );
  });
}

/* ------------------------------------------------------------------ piezas */
/** Convierte el nombre de archivo en la pieza lógica que representa. */
function partInfo(fileName) {
  const name = fileName.replace(/\.fbx$/i, '');
  const [gender, outfit, ...rest] = name.split('_');
  const part = rest.join('_');
  const slot = part.startsWith('Acc_Pauldron') ? 'acc'
    : part === 'Body' ? 'body'
    : part === 'Arms' ? 'arms'
    : part === 'Legs' ? 'legs'
    : part.startsWith('Feet') ? 'feet'
    : part === 'Head_Hood' ? 'head'
    : null;
  return { id: `${gender.toLowerCase()}_${outfit.toLowerCase()}_${part.toLowerCase()}`, gender: gender.toLowerCase(), outfit: outfit.toLowerCase(), slot };
}

async function convertParts() {
  const files = readdirSync(SRC_PARTS).filter((f) => f.toLowerCase().endsWith('.fbx')).sort();
  const parts = [];
  for (const file of files) {
    const info = partInfo(file);
    if (!info.slot) {
      console.warn(`  ! ${file}: pieza no reconocida, se omite`);
      continue;
    }
    const src = join(SRC_PARTS, file);
    const object = await parseFbx(src);
    const skeleton = canonicalizeSkeleton(object);
    if (!skeleton) {
      console.warn(`  ! ${file}: sin esqueleto, se omite`);
      continue;
    }
    optimizeObject(object);
    stripTextures(object);
    const out = join(PARTS_DIR, file.replace(/\.fbx$/i, '.glb'));
    await exportGlb(object, out);
    parts.push({ id: info.id, gender: info.gender, outfit: info.outfit, slot: info.slot, glb: `models/characters/parts/${basename(out)}` });
    console.log(`  ✓ ${file} → parts/${basename(out)} (${skeleton.bones.length} huesos)`);
  }
  return parts;
}

/* ------------------------------------------------------------------ texturas */
function convertTextures() {
  for (const plan of TEXTURE_PLAN) {
    const from = join(SRC_TEX, plan.from);
    const to = join(TEX_DIR, plan.to);
    if (!existsSync(from)) {
      console.warn(`  ! textura ausente: ${plan.from}`);
      continue;
    }
    mkdirSync(dirname(to), { recursive: true });
    const buffer = adaptPng(from, to, plan.size);
    writeFileSync(to, buffer);
    console.log(`  ✓ ${plan.from} → textures/${plan.to} (${plan.size}px, ${buffer.length.toLocaleString('es-ES')} B)`);
  }
}

/* ------------------------------------------------------------------ main */
/**
 * Omite la regeneración si las fuentes no han cambiado (los .glb y el
 * manifiesto son más recientes que todos los FBX y PNG de origen).
 * `--force` regenera siempre.
 */
function isFresh() {
  if (process.argv.includes('--force')) return false;
  if (!existsSync(CONFIG_PATH)) return false;
  const configTime = statSync(CONFIG_PATH).mtimeMs;
  const sources = [
    ...readdirSync(SRC_PARTS).map((f) => join(SRC_PARTS, f)),
    ...TEXTURE_PLAN.map((plan) => join(SRC_TEX, plan.from)),
    fileURLToPath(import.meta.url),
  ];
  for (const source of sources) {
    if (!existsSync(source)) return false;
    if (statSync(source).mtimeMs > configTime) return false;
  }
  const glbs = readdirSync(PARTS_DIR).filter((f) => f.endsWith('.glb'));
  return glbs.length >= 20;
}

async function main() {
  if (isFresh()) {
    console.log('· Personajes ya generados (fuentes sin cambios). Usa --force para regenerar.');
    return;
  }
  console.log('· Personajes de "media/Fantasy Character"');
  console.log('· Piezas modulares FBX → GLB');
  const parts = await convertParts();
  console.log(`· ${parts.length} piezas exportadas`);

  console.log('· Texturas adaptadas');
  convertTextures();

  const manifest = {
    version: 1,
    description: 'Manifiesto del sistema de personajes modulares (media/Fantasy Character). Cada pieza es un .glb esqueletado compatible con el resto de su género; los materiales se nombran por pieza (MI_Peasant, MI_Ranger, MI_Regular_*) y se visten en runtime con las texturas adaptadas de este mismo fichero.',
    parts,
    materials: MATERIALS,
    skin: {
      materials: ['MI_Regular_Male', 'MI_Regular_Female'],
      tones: { dark: 1.0, medium: 1.32, light: 1.62 },
    },
    guardianDefault: GUARDIAN_DEFAULT_LOOK,
    fit: { height: 1.85, center: true, ground: 0 },
  };
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  ✓ config/characters.json (${parts.length} piezas, ${Object.keys(MATERIALS).length} materiales)`);
  console.log('\nPersonajes generados en public/models/characters/');
}

main().catch((error) => {
  console.error('✗ gen-characters:', error?.stack ?? error);
  process.exit(1);
});
