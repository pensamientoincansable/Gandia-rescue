/**
 * Prepara para la web una selección curada de los recursos entregados en
 * media/. Los originales no se modifican: public/world es la versión servible
 * por Vite y por el bundle estático de GitHub Pages.
 *
 * Además de copiar, **adapta** cada imagen: se reescala a la resolución que
 * consume el motor y se recodifica sin canal alfa cuando no se necesita. Con
 * esto el peso servido baja un orden de magnitud frente a los PNG originales
 * sin perder detalle apreciable en un acabado de la era PS2.
 *
 * Familias de origen:
 *  · media/textures  → materiales de atrezo, suelo y rutas (Bricks, Grass,
 *    Roofs, Stone, Tile, Wood y Elements para agua/sal/revoco).
 *  · media/image     → atlas alfa de la vegetación FBX y fotografía aérea.
 *  · Panorama/       → cielos equirrectangulares (2048×1024) del ciclo día/noche.
 *  · Cubemap/        → los mismos cielos en cruz horizontal (2048×1536), que se
 *    rebanan en sus 6 caras para la iluminación de entorno (scene.environment).
 */
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { adaptPng, cropRegion, decodePng, encodePng, resizeImage } from './lib/png.mjs';

const root = resolve(import.meta.dirname, '..');
const media = resolve(root, 'media');
const target = resolve(root, 'public/world');

/* ------------------------------------------------------------------ catálogos */

// Satélite: se conserva publicado por compatibilidad con el manifiesto y las
// pruebas, pero las rutas practicables ya se pintan con los materiales de
// media/textures (asfalto de pizarra, adoquín y tierra apisonada).
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
 * Materiales de atrezo, suelo y rutas. Ahora proceden de la biblioteca
 * fotográfica de media/textures, elegidos por su patrón (grano, veta,
 * moteado, escama…); el motor aplica sobre ellos sólo un tinte casi neutro.
 */
const materials = [
  { to: 'sand', from: 'Elements/PTP-Elements_10-512x512.png' },   // arena de playa con conchas
  { to: 'earth', from: 'Stone/PTP-Stone_02-512x512.png' },        // tierra parda de huerta
  { to: 'clay', from: 'Bricks/Bricks_13-512x512.png' },           // adobe arcilloso agrietado
  { to: 'grass', from: 'Grass/Grass_08-512x512.png' },            // hierba media de ribera
  { to: 'meadow', from: 'Grass/Grass_09-512x512.png' },           // pradera clara
  { to: 'marsh', from: 'Grass/Grass_20-512x512.png' },            // marjal encharcada oscura
  { to: 'reedbed', from: 'Grass/Grass_21-512x512.png' },          // carrizal amarillento
  { to: 'forest', from: 'Grass/Grass_14-512x512.png' },           // suelo forestal denso
  { to: 'rock', from: 'Stone/PTP-Stone_01-512x512.png' },         // roca gris rugosa
  { to: 'stone', from: 'Bricks/Bricks_17-512x512.png' },          // sillería gris
  { to: 'gravel', from: 'Stone/PTP-Stone_07-512x512.png' },       // grava clara de cauce
  { to: 'cobble', from: 'Bricks/Bricks_18-512x512.png' },         // adoquín marrón del casco
  { to: 'wood', from: 'Wood/Wood_17-512x512.png' },               // tarima envejecida
  { to: 'timber', from: 'Wood/Wood_25-512x512.png' },             // madera oscura
  { to: 'metal', from: 'Stone/PTP-Stone_05-512x512.png' },        // metal pintado azulado
  { to: 'plaster', from: 'Elements/PTP-Elements_05-512x512.png' },// revoco encalado
  { to: 'cloth', from: 'Roofs/Roofs_06-512x512.png' },            // lona naranja a escamas
  { to: 'canvas', from: 'Tile/Tile_07-512x512.png' },             // lona teal hexagonal
  { to: 'rust', from: 'Stone/PTP-Stone_10-512x512.png' },         // óxido anaranjado
  { to: 'tile', from: 'Roofs/Roofs_04-512x512.png' },             // teja árabe de terracota
  { to: 'salt', from: 'Elements/PTP-Elements_04-512x512.png' },   // costra de sal
  { to: 'scrub', from: 'Grass/Grass_18-512x512.png' },            // monte bajo con guijarro
  { to: 'asphalt', from: 'Bricks/Bricks_16-512x512.png' },        // pizarra oscura (asfalto)
  { to: 'water-sea', from: 'Elements/PTP-Elements_07-512x512.png' }, // mar turquesa
  { to: 'water-river', from: 'Elements/PTP-Elements_11-512x512.png' },// agua dulce oscura
];

/*
 * Fases del ciclo día/noche. Cada fase empareja un panorama equirrectangular
 * (cúpula visible) con su cubemap en cruz (iluminación de entorno PBR).
 * Los índices 01-25 comparten cielo en ambas carpetas, así que cada fase
 * referencia el mismo número en Panorama/ y en Cubemap/.
 */
const skyPhases = [
  { id: 'noche', pano: 15 },        // noche cerrada con luna naranja
  { id: 'madrugada', pano: 12 },    // franja violeta antes del alba
  { id: 'alba', pano: 25 },         // bruma rosada del amanecer
  { id: 'amanecer', pano: 21 },     // sol naranja sobre el horizonte
  { id: 'manana', pano: 16 },       // azul pálido con cirros
  { id: 'mediodia', pano: 5 },      // cielo azul intenso, sol en cénit
  { id: 'tarde', pano: 4 },         // azul con sol descendiendo
  { id: 'atardecer', pano: 2 },     // hora dorada brumosa
  { id: 'ocaso', pano: 19 },        // puesta de sol roja profunda
  { id: 'crepusculo', pano: 7 },    // nubes púrpura del crepúsculo
];

const CUBE_FACE = 512; // tamaño de cara en la cruz horizontal de 2048×1536
// Orden de la cruz horizontal: [−X, +Z, +X, −Z] en la fila central,
// +Y arriba y −Y abajo (plegado estándar de cubemaps, compatible con WebGL).
const cubeFaces = [
  { face: 'py', x: CUBE_FACE, y: 0 },
  { face: 'nx', x: 0, y: CUBE_FACE },
  { face: 'pz', x: CUBE_FACE, y: CUBE_FACE },
  { face: 'px', x: CUBE_FACE * 2, y: CUBE_FACE },
  { face: 'nz', x: CUBE_FACE * 3, y: CUBE_FACE },
  { face: 'ny', x: CUBE_FACE, y: CUBE_FACE * 2 },
];

/* ------------------------------------------------------------------ ejecución */

await rm(target, { recursive: true, force: true });

const jobs = [];
const pushAdapt = (from, to, size) => jobs.push({ kind: 'adapt', from, to, size });

// Copias literales: modelos FBX (binarios pequeños).
// Atlas de vegetación adaptados desde media/image.
for (const name of vegetation) {
  jobs.push({
    kind: 'copy',
    from: resolve(media, `models/${name}.fbx`),
    to: resolve(target, `vegetation/${name}.fbx`),
  });
  pushAdapt(resolve(media, `image/${name}.png`), resolve(target, `vegetation/${name}.png`), 128);
}

// Imágenes de satélite publicadas por compatibilidad del manifiesto.
for (const { from, to } of satellite) {
  pushAdapt(resolve(media, `image/${from}`), resolve(target, `satellite/${to}.png`), 256);
}

// Cielos cuadrados de respaldo (fallbacks y variantes del refugio 2.5D).
for (const { from, to } of sky) {
  pushAdapt(resolve(media, `image/${from}`), resolve(target, `sky/${to}.png`), 224);
}

// Materiales de atrezo, suelo y rutas desde media/textures.
for (const { from, to } of materials) {
  pushAdapt(resolve(media, `textures/${from}`), resolve(target, `materials/${to}.png`), 192);
}

let bytes = 0;
let cubeBytes = 0;

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

/*
 * Cielos del ciclo día/noche:
 *  · sky/pano/<fase>.png       → panorama equirrectangular 1024×512.
 *  · sky/cube/<fase>-<cara>.png → 6 caras de 256² rebanadas de la cruz.
 */
for (const { id, pano } of skyPhases) {
  const number = String(pano).padStart(2, '0');

  const panoBuffer = adaptPng(
    resolve(root, `Panorama/Panorama_Sky_${number}-512x512.png`),
    resolve(target, `sky/pano/${id}.png`),
    1024, // ancho; png.mjs reescala a 1024×512 manteniendo la proporción 2:1
  );
  await mkdir(resolve(target, 'sky/pano'), { recursive: true });
  await writeFile(resolve(target, `sky/pano/${id}.png`), panoBuffer);
  bytes += panoBuffer.length;

  await mkdir(resolve(target, 'sky/cube'), { recursive: true });
  const decoded = decodePng(resolve(root, `Cubemap/Cubemap_Sky_${number}-512x512.png`));
  for (const { face, x, y } of cubeFaces) {
    const slice = cropRegion(decoded, x, y, CUBE_FACE, CUBE_FACE);
    const buffer = encodePng(resizeImage(slice, 256, 256));
    await writeFile(resolve(target, `sky/cube/${id}-${face}.png`), buffer);
    cubeBytes += buffer.length;
  }
}

console.log(`✓ ${jobs.length + skyPhases.length * 7} recursos adaptados en public/world`);
console.log(`  · ${vegetation.length} modelos FBX de vegetación con su atlas`);
console.log(`  · ${materials.length} materiales desde media/textures, ${satellite.length} satélites y ${sky.length} cielos cuadrados`);
console.log(`  · ${skyPhases.length} fases de cielo (panorama 1024×512 + 6 caras de cubemap 256²)`);
console.log(`  · imágenes reescaladas y recodificadas: ${((bytes + cubeBytes) / 1024 / 1024).toFixed(2)} MB servidos`);
