/**
 * Verifica la adaptación de recursos de /media al mundo 3D:
 *  - las URL configuradas apuntan a archivos públicos existentes;
 *  - todos los FBX de vegetación contienen una malla y UVs válidas;
 *  - las texturas de terreno y cielo usadas por cada paisaje son accesibles.
 *
 * Ejecutar: node scripts/world-assets-test.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  MATERIAL_SETTINGS, MATERIAL_TEXTURES, PROP_MODELS, SHELTER_TEXTURES,
  SHELTER_TREE_SPRITES, SKY_TEXTURES, SATELLITE_TEXTURES, TERRAIN_TEXTURES, VEGETATION_ASSETS,
} from '../src/three/WorldAssets.js';
import { PROP_TEMPLATES } from '../src/three/PropsLibrary.js';

let failures = 0;
const expect = (condition, label) => {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) failures += 1;
};
const existingUrl = (url) => {
  try { return url.startsWith('file:') && existsSync(fileURLToPath(url)); } catch { return false; }
};
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = join(projectRoot, 'public');
const staticRoot = join(projectRoot, 'static');
const configuredUrls = new Set();
const track = (url) => { configuredUrls.add(url); return existingUrl(url); };

console.log('· Texturas ambientales adaptadas desde media');
for (const [zone, url] of Object.entries(TERRAIN_TEXTURES)) {
  expect(track(url), `${zone}: textura de terreno pública disponible`);
}
for (const [zone, url] of Object.entries(SKY_TEXTURES)) {
  expect(track(url), `${zone}: textura de cielo pública disponible`);
}
for (const [ground, url] of Object.entries(SHELTER_TEXTURES.ground)) {
  expect(track(url), `refugio/${ground}: textura de loseta disponible`);
}

console.log('· Modelos FBX y atlas de vegetación');
for (const [assetId, asset] of Object.entries(VEGETATION_ASSETS)) {
  const hasModel = track(asset.modelUrl);
  const hasTexture = track(asset.textureUrl);
  expect(hasModel, `${assetId}: modelo FBX copiado desde media/models`);
  expect(hasTexture, `${assetId}: atlas PNG copiado desde media/image`);
  if (!hasModel) continue;

  try {
    const bytes = readFileSync(fileURLToPath(asset.modelUrl));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const root = new FBXLoader().parse(buffer, '');
    let mesh = null;
    root.traverse((node) => { if (!mesh && node.isMesh) mesh = node; });
    expect(Boolean(mesh?.geometry?.attributes?.position?.count), `${assetId}: FBX contiene geometría de árbol`);
    expect(Boolean(mesh?.geometry?.attributes?.uv?.count), `${assetId}: FBX contiene UV para su atlas`);
  } catch (error) {
    expect(false, `${assetId}: FBX se puede parsear (${error.message})`);
  }
}

console.log('· Satélite reservado a las rutas practicables');
for (const [zone, url] of Object.entries(SATELLITE_TEXTURES)) {
  expect(track(url), `${zone}: imagen satelital disponible para su ruta`);
}
expect(TERRAIN_TEXTURES === SATELLITE_TEXTURES, 'el suelo ya no usa satélite (alias de compatibilidad)');

console.log('· Materiales de atrezo y suelo');
for (const [kind, url] of Object.entries(MATERIAL_TEXTURES)) {
  const ok = track(url);
  expect(ok, `${kind}: mapa de material adaptado desde media/image`);
  expect(Boolean(MATERIAL_SETTINGS[kind]?.tint !== undefined), `${kind}: ajustes de tinte definidos`);
}
for (const sprite of SHELTER_TREE_SPRITES) {
  expect(track(sprite), 'atlas de vegetación del refugio disponible');
}

console.log('· Modelos .glb de atrezo e hitos');
const materialNames = new Set(Object.keys(MATERIAL_SETTINGS));
for (const [propId, url] of Object.entries(PROP_MODELS)) {
  const hasModel = track(url);
  expect(hasModel, `${propId}: modelo .glb generado en public/world/props`);
  if (!hasModel) continue;
  try {
    const bytes = readFileSync(fileURLToPath(url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(buffer, '', resolve, reject);
    });
    let meshes = 0;
    let triangles = 0;
    const used = new Set();
    gltf.scene.traverse((node) => {
      if (!node.isMesh) return;
      meshes += 1;
      triangles += node.geometry.attributes.position.count / 3;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of mats) used.add(material?.name);
    });
    expect(meshes > 0, `${propId}: contiene geometría modelada (${meshes} piezas)`);
    expect(triangles > 40, `${propId}: silueta trabajada (${Math.round(triangles)} triángulos)`);
    const unknown = [...used].filter((name) => name && !materialNames.has(name)
      && !['glass', 'water', 'beacon', 'lamp', 'rope', 'flag'].includes(name));
    expect(unknown.length === 0, `${propId}: materiales reconocibles [${[...used].join(', ')}]`);
  } catch (error) {
    expect(false, `${propId}: el .glb se puede parsear (${error.message})`);
  }
}

console.log('· Atrezo instanciado');
for (const [propId, template] of Object.entries(PROP_TEMPLATES)) {
  const parts = template.parts ?? [];
  expect(parts.length > 0, `${propId}: define piezas modeladas`);
  expect(parts.every((part) => typeof part.geometry === 'function'), `${propId}: geometría construible`);
  expect(parts.every((part) => materialNames.has(part.material)
    || ['glass', 'water', 'beacon', 'lamp', 'rope', 'flag'].includes(part.material)),
    `${propId}: materiales con mapa propio`);
}

console.log('· Copia publicada para GitHub Pages');
const missingStaticCopies = [];
const staleStaticCopies = [];
for (const url of configuredUrls) {
  try {
    const source = fileURLToPath(url);
    const published = join(staticRoot, relative(publicRoot, source));
    if (!existsSync(published)) {
      missingStaticCopies.push(relative(publicRoot, source));
    } else if (statSync(published).size !== statSync(source).size) {
      staleStaticCopies.push(relative(publicRoot, source));
    }
  } catch {
    missingStaticCopies.push(url);
  }
}
expect(missingStaticCopies.length === 0, `static/ incluye los ${configuredUrls.size} recursos configurados`);
expect(staleStaticCopies.length === 0, 'las copias publicadas coinciden en tamaño con public/');

console.log(failures === 0
  ? '\n✓ Recursos ambientales validados'
  : `\n✗ ${failures} comprobaciones de recursos fallidas`);
process.exit(failures ? 1 : 0);
