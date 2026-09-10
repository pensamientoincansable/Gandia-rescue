/**
 * Descarga el modelo 3D del personaje jugable y lo deja en `public/models/`
 * para que el juego lo sirva en local (rápido, sin depender del CDN ni de su
 * política CORS y disponible también en la copia `static/` de GitHub Pages).
 *
 * La URL se lee del manifiesto `public/config/models.json` (primera candidata
 * `https://` de `ranger.paths`), de modo que cambiar de modelo es editar el
 * JSON —o pasar `--url=`— y volver a ejecutar este script.
 *
 * Uso:
 *   npm run assets:player                       # usa la URL del manifiesto
 *   npm run assets:player -- --url=https://…    # otra URL
 *   npm run assets:player -- --force            # sobrescribe la copia local
 *   npm run assets:player -- --strict           # falla si no puede descargar
 *
 * Comportamiento por defecto: no interrumpe el build. Si ya existe la copia
 * local se respeta, y si no hay red se avisa y el juego sigue usando la URL
 * remota (o el ranger procedural) gracias a la cadena de candidatas.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const staticRoot = resolve(root, 'static');

const args = process.argv.slice(2);
const argValue = (name) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : null;
};
const hasFlag = (name) => args.includes(`--${name}`);
const force = hasFlag('force');
const strict = hasFlag('strict');

/** Primera candidata remota declarada para el personaje jugable. */
function remoteUrlFromManifest() {
  const manifestPath = resolve(publicRoot, 'config/models.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const candidates = manifest?.ranger?.paths ?? [manifest?.ranger?.path].filter(Boolean);
  return candidates.find((item) => typeof item === 'string' && /^https?:\/\//.test(item)) ?? null;
}

/** Ruta local destino declarada en el manifiesto (o la por defecto). */
function localTargetFromManifest() {
  const manifestPath = resolve(publicRoot, 'config/models.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const candidates = manifest?.ranger?.paths ?? [manifest?.ranger?.path].filter(Boolean);
  const local = candidates.find((item) => typeof item === 'string' && !/^https?:\/\//.test(item));
  return resolve(publicRoot, local ?? 'models/ranger-supavoxel.glb');
}

/** Comprueba la cabecera mágica de un GLB (`glTF` + versión 2). */
function assertGlb(buffer, label) {
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  if (magic !== 0x46546c67) throw new Error(`${label}: no es un .glb válido (falta la cabecera "glTF")`);
  if (version !== 2) console.warn(`  ! ${label}: versión GLB ${version} (se esperaba 2)`);
}

async function main() {
  const url = argValue('url') ?? remoteUrlFromManifest();
  if (!url) {
    const message = 'No hay ninguna URL https:// en ranger.paths del manifiesto de modelos.';
    if (strict) throw new Error(message);
    console.warn(`· assets:player omitido — ${message}`);
    return;
  }

  const target = localTargetFromManifest();
  if (existsSync(target) && !force) {
    console.log(`· Modelo del jugador ya presente: ${target.split('/public/')[1] ?? target} (usa --force para sobrescribir)`);
    return;
  }

  console.log(`· Descargando modelo del jugador\n  ${url}`);
  let buffer;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`respuesta HTTP ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    const message = `No se pudo descargar el modelo (${error?.message ?? error}). `
      + 'El juego seguirá usándolo desde la URL remota o el ranger procedural.';
    if (strict) throw new Error(message);
    console.warn(`· assets:player sin red — ${message}`);
    return;
  }

  assertGlb(buffer, 'modelo descargado');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  console.log(`  ✓ ${target.split('/public/')[1] ?? target}  (${buffer.length.toLocaleString('es-ES')} B)`);

  // La copia publicada de GitHub Pages se regenera con `npm run build:static`;
  // si ya existe el directorio, la actualizamos para que el cambio sea inmediato.
  const staticModels = resolve(staticRoot, 'models');
  if (existsSync(staticModels)) {
    const staticTarget = resolve(staticModels, target.slice(publicRoot.length + 1).replace(/^models[\\/]/, ''));
    mkdirSync(dirname(staticTarget), { recursive: true });
    copyFileSync(target, staticTarget);
    console.log(`  ✓ static/${staticTarget.split('/static/')[1] ?? staticTarget}`);
  }
  console.log('  ℹ El manifiesto ya apunta a esta copia local: no hace falta editar nada más.');
}

main().catch((error) => {
  console.error(`✗ assets:player: ${error?.message ?? error}`);
  process.exit(1);
});
