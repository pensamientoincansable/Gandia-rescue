/**
 * Prepara para la web una selección curada de los recursos entregados en
 * media/. Los originales no se modifican: public/world es la versión servible
 * por Vite y por el bundle estático de GitHub Pages.
 */
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'public/world');

const terrain = [3, 10, 13, 15, 17, 19, 21, 22].map((n) => `Terrain_${String(n).padStart(2, '0')}-512x512.png`);
const elements = [1, 3, 5, 7].map((n) => `Elements_${String(n).padStart(2, '0')}-512x512.png`);
const vegetation = [
  'tree02', 'tree04', 'tree06', 'tree08', 'tree10', 'tree12',
  'tree15', 'tree16', 'tree18', 'tree24', 'tree28', 'tree32',
  'bush01', 'bush04', 'bush07',
];

const files = [
  ...terrain.map((file) => ({ from: `media/image/${file}`, to: `terrain/${file}` })),
  ...elements.map((file) => ({ from: `media/image/${file}`, to: `elements/${file}` })),
  ...vegetation.flatMap((name) => [
    { from: `media/models/${name}.fbx`, to: `vegetation/${name}.fbx` },
    { from: `media/image/${name}.png`, to: `vegetation/${name}.png` },
  ]),
];

await rm(target, { recursive: true, force: true });
await Promise.all(files.map(async ({ from, to }) => {
  const destination = resolve(target, to);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, from), destination);
}));

console.log(`✓ ${files.length} texturas y modelos de media preparados en public/world`);
