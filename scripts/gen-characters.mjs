/**
 * Genera los recursos del sistema de personajes desde `media/glTF`.
 *
 * La carpeta `media/glTF` contiene 11 personajes completos (aventurero, playa,
 * casual, granjero, rey, punk, traje, SWAT, obrero, astronauta y sudadera),
 * cada uno como un `.gltf` autocontenido (malla esqueletada + 24 animaciones
 * + materiales con color plano). Son la fuente definitiva del guardián jugable
 * y de los lugareños: traen CABEZA real (cara, pelo, ojos, cejas) en lugar del
 * ovoide procedural que necesitaba el pack anterior, que no incluía geometría
 * de cabeza.
 *
 * Este script:
 *   1. Empaqueta cada `.gltf` (con su buffer base64 embebido) como `.glb`
 *      binario en `public/models/characters/` — el mismo contenido, un solo
 *      fichero y ~25 % más ligero, servible tal cual por GLTFLoader.
 *   2. Escribe `public/config/characters.json`, el manifiesto que el juego
 *      consume en caliente (rutas, mapa de animaciones, tonos de piel y
 *      aspecto por defecto del guardián).
 *   3. Refleja ambos resultados en `static/` (la copia publicada de GitHub
 *      Pages) y retira las piezas/texturas del pack modular anterior, que ya
 *      no se usan.
 *
 * Los `.fbx` de `media/models/<Personaje>/` son los recursos fuente de estos
 * mismos personajes partidos por pieza; los `.gltf` ya son la exportación
 * completa (malla + esqueleto + animaciones), así que se usan directamente y
 * no hace falta reensamblar nada.
 *
 * Uso:
 *   node scripts/gen-characters.mjs        # o npm run assets:characters
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ rutas */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_GLTF_DIR = join(root, 'media/glTF');
const OUT_CHARS_DIR = join(root, 'public/models/characters');
const STATIC_CHARS_DIR = join(root, 'static/models/characters');
const CONFIG_PATH = join(root, 'public/config/characters.json');
const STATIC_CONFIG_PATH = join(root, 'static/config/characters.json');

/* ------------------------------------------------------------------ config */

/**
 * Mapa de animaciones estado → clip. Los 11 personajes comparten los mismos
 * 24 clips (Death, Idle, Walk, Run, Interact, Wave…). No hay clip de salto:
 * en el aire el mixer conserva el último bucle (caminar/correr), que es lo
 * que espera el motor de locomoción (la posición la mueve el input, no la
 * raíz de la animación: los ciclos son in-place).
 */
const ANIMATIONS = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  talk: 'Interact',
  interact: 'Interact',
  wave: 'Wave',
};

/** Materiales de piel (se tiñen con el tono elegido en el personalizador). */
const SKIN_MATERIALS = ['Skin', 'Skin_Darker'];

/** Tono de piel: multiplicador sobre el color base del material `Skin`. */
const SKIN_TONES = { dark: 0.78, medium: 1.0, light: 1.24 };

/** Aspecto por defecto del guardián jugable. */
const GUARDIAN_DEFAULT_LOOK = { character: 'Adventurer', skin: 'medium' };

/** Ajuste al tamaño del juego (los personajes ya vienen en metros, ~1.82 m). */
const FIT = { height: 1.85, center: true, ground: 0 };

/* ------------------------------------------------------------------ gltf → glb */

/**
 * Empaqueta un `.gltf` autocontenido como `.glb` binario sin reexportar por
 * Three.js (cero pérdida de fidelidad: se conservan esqueleto, pesos, orden
 * de accesores y animaciones exactamente como los escribió Blender).
 *
 * GLB v2 = cabecera (12 B) + chunk JSON + chunk BIN. El chunk JSON se rellena
 * con ESPACIOS (0x20, como exige la especificación) y el BIN con ceros.
 */
function gltfToGlb(gltfPath) {
  const json = JSON.parse(readFileSync(gltfPath, 'utf8'));
  const uri = json.buffers?.[0]?.uri ?? '';
  const match = /^data:[^;]+;base64,(.*)$/s.exec(uri);
  if (!match) throw new Error(`${basename(gltfPath)}: buffer sin data URI base64 embebido`);

  const bin = Buffer.from(match[1], 'base64');

  // En GLB el contenido del buffer va en el chunk BIN, no como data URI:
  // se retira la `uri` (GLTFLoader la intentaría descargar por fetch) y se
  // deja sólo el byteLength para que lea del chunk binario.
  delete json.buffers[0].uri;
  json.buffers[0].byteLength = bin.length;
  const binPad = (4 - (bin.length % 4)) % 4;
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const binChunkLen = bin.length + binPad;
  const jsonChunkLen = jsonBuf.length + jsonPad;
  const total = 12 + 8 + jsonChunkLen + 8 + binChunkLen;

  const glb = Buffer.alloc(total);
  glb.writeUInt32LE(0x46546c67, 0); // "glTF"
  glb.writeUInt32LE(2, 4);          // versión 2
  glb.writeUInt32LE(total, 8);
  glb.writeUInt32LE(jsonChunkLen, 12);
  glb.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  jsonBuf.copy(glb, 20);
  glb.fill(0x20, 20 + jsonBuf.length, 20 + jsonChunkLen); // relleno de espacios
  const off = 20 + jsonChunkLen;
  glb.writeUInt32LE(binChunkLen, off);
  glb.writeUInt32LE(0x004e4942, off + 4); // "BIN\0"
  bin.copy(glb, off + 8);
  return glb;
}

/* ------------------------------------------------------------------ utilidades */

/** Copia un fichero binario a static/ si el directorio destino existe. */
function mirrorToStatic(srcFile) {
  const rel = srcFile.slice((join(root, 'public') + '/').length);
  const target = join(root, 'static', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(srcFile));
  return `static/${rel}`;
}

/** Elimina el legado modular (piezas + texturas del pack anterior). */
function removeLegacy() {
  for (const base of [OUT_CHARS_DIR, STATIC_CHARS_DIR]) {
    rmSync(join(base, 'parts'), { recursive: true, force: true });
    rmSync(join(base, 'textures'), { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ main */

/**
 * Omite la regeneración si las fuentes no han cambiado (los .glb y el
 * manifiesto son más recientes que todos los .gltf de origen). `--force`
 * regenera siempre.
 */
function isFresh() {
  if (process.argv.includes('--force')) return false;
  if (!existsSync(CONFIG_PATH)) return false;
  const configTime = statSync(CONFIG_PATH).mtimeMs;
  const sources = [
    ...readdirSync(SRC_GLTF_DIR).filter((f) => f.toLowerCase().endsWith('.gltf')).map((f) => join(SRC_GLTF_DIR, f)),
    fileURLToPath(import.meta.url),
  ];
  for (const source of sources) {
    if (!existsSync(source) || statSync(source).mtimeMs > configTime) return false;
  }
  return readdirSync(OUT_CHARS_DIR).filter((f) => f.endsWith('.glb')).length >= 11;
}

function main() {
  if (isFresh()) {
    console.log('· Personajes ya generados (fuentes sin cambios). Usa --force para regenerar.');
    return;
  }

  console.log('· Personajes de "media/glTF"');
  console.log('· glTF autocontenidos → GLB binario');

  removeLegacy();
  mkdirSync(OUT_CHARS_DIR, { recursive: true });
  mkdirSync(STATIC_CHARS_DIR, { recursive: true });

  const files = readdirSync(SRC_GLTF_DIR).filter((f) => f.toLowerCase().endsWith('.gltf')).sort();
  const characters = [];
  let totalBytes = 0;
  for (const file of files) {
    const id = file.replace(/\.gltf$/i, '');
    const src = join(SRC_GLTF_DIR, file);
    const glb = gltfToGlb(src);
    const out = join(OUT_CHARS_DIR, `${id}.glb`);
    writeFileSync(out, glb);
    totalBytes += glb.length;

    const relGlb = `models/characters/${basename(out)}`;
    characters.push({ id, glb: relGlb });
    console.log(`  ✓ ${file} → ${relGlb} (${(glb.length / 1024).toFixed(1)} kB)`);
  }

  const manifest = {
    version: 2,
    description: 'Manifiesto del sistema de personajes (media/glTF). Cada personaje es un .glb esqueletado COMPLETO (cabeza real incluida) con sus 24 animaciones; los materiales de piel se tiñen en runtime con el tono elegido.',
    characters,
    animations: ANIMATIONS,
    skin: { materials: SKIN_MATERIALS, tones: SKIN_TONES },
    guardianDefault: GUARDIAN_DEFAULT_LOOK,
    fit: FIT,
  };
  writeFileSync(CONFIG_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  ✓ config/characters.json (${characters.length} personajes, ${Object.keys(ANIMATIONS).length} animaciones mapeadas)`);

  // Copia publicada de GitHub Pages.
  for (const { glb } of characters) {
    mirrorToStatic(join(root, 'public', glb));
  }
  writeFileSync(STATIC_CONFIG_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('  ✓ static/config/characters.json y static/models/characters/');

  console.log(`\nPersonajes generados en public/models/characters (${(totalBytes / 1024).toFixed(0)} kB en total).`);
}

try {
  main();
} catch (error) {
  console.error('✗ gen-characters:', error?.stack ?? error);
  process.exit(1);
}
