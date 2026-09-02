/**
 * Prepara para la web una selección curada de los recursos entregados en
 * media/. Los originales no se modifican: public/world es la versión servible
 * por Vite y por el bundle estático de GitHub Pages.
 *
 * Además de copiar, **adapta** cada imagen: se reescala a la resolución que
 * consume el motor (256 px para suelos y cielos, 192 px para materiales de
 * atrezo, 128 px para los atlas de vegetación) y se recodifica sin canal alfa
 * cuando no se necesita. Con esto el peso servido baja un orden de magnitud
 * frente a los PNG originales de 512 px sin perder detalle apreciable en un
 * acabado de la era PS2.
 */
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { adaptPng } from './lib/png.mjs';

const root = resolve(import.meta.dirname, '..');
const media = resolve(root, 'media');
const target = resolve(root, 'public/world');

/* ------------------------------------------------------------------ catálogos */

// Satélite: la ÚNICA familia de imágenes que el mundo 3D sigue usando como
// fotografía aérea, y sólo para las rutas practicables (carreteras, caminos y
// puentes). El terreno ya no se pinta con satélite, sino con materiales
// propios por hábitat (ver GROUND_TEXTURES en src/three/WorldAssets.js).
const satellite = [
  { to: 'platja', from: 'Terrain_03-512x512.png' },
  { to: 'port', from: 'Terrain_10-512x512.png' },
  { to: 'marjal', from: 'Terrain_17-512x512.png' },
  { to: 'riu', from: 'Terrain_19-512x512.png' },
  { to: 'casc', from: 'Terrain_21-512x512.png' },
  { to: 'montduver', from: 'Terrain_15-512x512.png' },
];
const sky = [
  { to: 'day', from: 'Elements_01-512x512.png' },
  { to: 'sunset-2', from: 'Elements_03-512x512.png' },
  { to: 'sunset', from: 'Elements_05-512x512.png' },
  { to: 'night', from: 'Elements_07-512x512.png' },
];

// Vegetación modelada: 23 árboles y los 8 arbustos de media/models.
const vegetation = [
  'tree01', 'tree02', 'tree04', 'tree05', 'tree06', 'tree08', 'tree09', 'tree10',
  'tree11', 'tree12', 'tree13', 'tree14', 'tree15', 'tree16', 'tree18', 'tree20',
  'tree22', 'tree26', 'tree27', 'tree28', 'tree30', 'tree32', 'tree35',
  'bush01', 'bush02', 'bush03', 'bush04', 'bush05', 'bush06', 'bush07', 'bush08',
];

/*
 * Materiales de atrezo. Cada entrada elige un PNG de media/image por su
 * *patrón* (grano de arena, veta de madera, moteado de roca…) y después el
 * motor lo tiñe con el color del material concreto, de modo que una sola
 * imagen sirve para varias superficies distintas.
 */
const materials = [
  { to: 'sand', from: 'Terrain_09-512x512.png' },        // grano fino y claro
  { to: 'earth', from: 'Terrain_01-512x512.png' },       // tierra de huerta
  { to: 'clay', from: 'Terrain_02-512x512.png' },        // arcilla / terracota
  { to: 'grass', from: 'Terrain_13-512x512.png' },       // hierba de ribera
  { to: 'meadow', from: 'Terrain_07-512x512.png' },      // pradera y matorral
  { to: 'marsh', from: 'Terrain_17-512x512.png' },       // marjal encharcada
  { to: 'reedbed', from: 'Terrain_11-512x512.png' },     // carrizal
  { to: 'forest', from: 'Terrain_15-512x512.png' },      // suelo forestal
  { to: 'rock', from: 'Elements_21-512x512.png' },       // roca moteada
  { to: 'stone', from: 'Elements_22-512x512.png' },      // sillería
  { to: 'gravel', from: 'Terrain_16-512x512.png' },      // grava y canto rodado
  { to: 'cobble', from: 'Terrain_22-512x512.png' },      // adoquín
  { to: 'wood', from: 'Terrain_06-512x512.png' },        // madera
  { to: 'timber', from: 'Terrain_05-512x512.png' },      // madera oscura
  { to: 'metal', from: 'Elements_23-512x512.png' },      // metal pintado
  { to: 'plaster', from: 'Elements_16-512x512.png' },    // revoco encalado
  { to: 'cloth', from: 'Elements_09-512x512.png' },      // lona y toldos
  { to: 'canvas', from: 'Elements_10-512x512.png' },     // lona alternativa
  { to: 'rust', from: 'Terrain_21-512x512.png' },        // óxido y teja vieja
  { to: 'tile', from: 'Elements_12-512x512.png' },       // teja árabe
  { to: 'salt', from: 'Terrain_12-512x512.png' },        // saladares
  { to: 'scrub', from: 'Terrain_14-512x512.png' },       // monte bajo
];

/* ------------------------------------------------------------------ ejecución */

await rm(target, { recursive: true, force: true });

const jobs = [];

// Copias literales: modelos FBX (binarios pequeños) y atlas de vegetación.
for (const name of vegetation) {
  jobs.push({
    kind: 'copy',
    from: resolve(media, `models/${name}.fbx`),
    to: resolve(target, `vegetation/${name}.fbx`),
  });
  jobs.push({
    kind: 'adapt',
    from: resolve(media, `image/${name}.png`),
    to: resolve(target, `vegetation/${name}.png`),
    size: 128,
  });
}

// Imágenes de satélite: única familia que se conserva como fotografía aérea.
for (const { from, to } of satellite) {
  jobs.push({
    kind: 'adapt',
    from: resolve(media, `image/${from}`),
    to: resolve(target, `satellite/${to}.png`),
    size: 256,
  });
}

// Cielos.
for (const { from, to } of sky) {
  jobs.push({
    kind: 'adapt',
    from: resolve(media, `image/${from}`),
    to: resolve(target, `sky/${to}.png`),
    size: 224,
  });
}

// Materiales de atrezo.
for (const { from, to } of materials) {
  jobs.push({
    kind: 'adapt',
    from: resolve(media, `image/${from}`),
    to: resolve(target, `materials/${to}.png`),
    size: 128,
  });
}

let bytes = 0;
await Promise.all(jobs.map(async (job) => {
  await mkdir(dirname(job.to), { recursive: true });
  if (job.kind === 'copy') {
    await copyFile(job.from, job.to);
    return;
  }
  const buffer = adaptPng(job.from, job.to, job.size);
  await writeFile(job.to, buffer);
  bytes += buffer.length;
}));

console.log(`✓ ${jobs.length} recursos de media adaptados en public/world`);
console.log(`  · ${vegetation.length} modelos FBX de vegetación con su atlas`);
console.log(`  · ${materials.length} materiales de atrezo, ${satellite.length} imágenes de satélite y ${sky.length} cielos`);
console.log(`  · imágenes reescaladas y recodificadas: ${(bytes / 1024 / 1024).toFixed(2)} MB servidos`);
