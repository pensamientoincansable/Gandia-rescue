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
import {
  SHELTER_TEXTURES, SKY_TEXTURES, TERRAIN_TEXTURES, VEGETATION_ASSETS,
} from '../src/three/WorldAssets.js';

let failures = 0;
const expect = (condition, label) => {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) failures += 1;
};
const existingUrl = (url) => {
  try { return url.startsWith('file:') && existsSync(fileURLToPath(url)); } catch { return false; }
};
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicWorld = join(projectRoot, 'public', 'world');
const staticWorld = join(projectRoot, 'static', 'world');
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

console.log('· Copia publicada para GitHub Pages');
const missingStaticCopies = [];
const staleStaticCopies = [];
for (const url of configuredUrls) {
  try {
    const source = fileURLToPath(url);
    const published = join(staticWorld, relative(publicWorld, source));
    if (!existsSync(published)) {
      missingStaticCopies.push(relative(publicWorld, source));
    } else if (statSync(published).size !== statSync(source).size) {
      staleStaticCopies.push(relative(publicWorld, source));
    }
  } catch {
    missingStaticCopies.push(url);
  }
}
expect(missingStaticCopies.length === 0, `static/world incluye los ${configuredUrls.size} recursos configurados`);
expect(staleStaticCopies.length === 0, 'las copias publicadas coinciden en tamaño con public/world');

console.log(failures === 0
  ? '\n✓ Recursos ambientales validados'
  : `\n✗ ${failures} comprobaciones de recursos fallidas`);
process.exit(failures ? 1 : 0);
