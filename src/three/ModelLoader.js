import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * ModelLoader — carga y cachea modelos 3D `.gltf` / `.glb` vía GLTFLoader.
 *
 * Soporta dos orígenes:
 *   · Rutas relativas del proyecto (p. ej. `models/human.glb`): se resuelven
 *     contra la base del documento para funcionar igual en el dev-server de
 *     Vite y en GitHub Pages (que sirve `static/` desde una subruta).
 *   · URLs absolutas (https://…).
 *
 * Diseño defensivo: si el modelo no existe o falla la descarga, `loadModel`
 * devuelve `null` y el juego usa el monigote de respaldo (primitivas). Así,
 * basta con dejar un `.glb` en `public/models/` para activar los modelos
 * detallados sin romper nada.
 */

let _loader = null;
const _cache = new Map();
/** Costura de pruebas: si se define, `loadModel` delega aquí (sin red). */
const _hooks = { resolve: null };

/**
 * Sustituye el cargador de modelos por una función propia (sólo pruebas).
 * Permite simular assets remotos o fallos de red sin tocar el disco.
 * @param {((path: string) => import('three').GLTF|null)|null} fn
 */
export function setModelResolverForTests(fn) {
  _hooks.resolve = typeof fn === 'function' ? fn : null;
}

/** Instancia única de GLTFLoader (compartida para aprovechar su caché). */
export function getGLTFLoader() {
  if (!_loader) _loader = new GLTFLoader();
  return _loader;
}

/**
 * Base de recursos para desarrollo, dist y la copia `static/` de GitHub Pages.
 * En Pages el documento sigue en la raíz mientras los modelos están en
 * `static/models`; `import.meta.url` permite reconocer esa variante incluso
 * si una prueba importa el bundle como file:.
 */
function resolveBase() {
  if (typeof document !== 'undefined' && document.baseURI) {
    return /\/static\//.test(import.meta.url)
      ? new URL('static/', document.baseURI).href
      : new URL('./', document.baseURI).href;
  }
  return './';
}

function configUrl() {
  if (typeof document !== 'undefined' && document.baseURI) {
    const base = /\/static\//.test(import.meta.url)
      ? new URL('static/', document.baseURI)
      : new URL('./', document.baseURI);
    return new URL('config/models.json', base).href;
  }
  return 'config/models.json';
}

/** Convierte una ruta de modelo en una URL usable por GLTFLoader. */
export function modelUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.replace(/^\.?\//, '');
  return new URL(clean, resolveBase()).href;
}

/**
 * Carga un modelo GLTF/GLB (cacheado). Resuelve `null` si no se puede cargar.
 * @param {string|null} path Ruta relativa o URL absoluta del modelo.
 * @returns {Promise<import('three').GLTF|null>}
 */
export function loadModel(path) {
  if (!path) return Promise.resolve(null);
  if (_hooks.resolve) {
    // Modo pruebas: sin caché ni red, el resultado lo decide la función.
    try {
      return Promise.resolve(_hooks.resolve(path) ?? null);
    } catch (e) {
      return Promise.resolve(null);
    }
  }
  const url = modelUrl(path);
  if (_cache.has(url)) return _cache.get(url);

  const promise = new Promise((resolve) => {
    try {
      getGLTFLoader().load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        () => resolve(null) // 404 / red: respaldo procedural
      );
    } catch (e) {
      resolve(null); // entorno sin fetch/XHR: no romper la carga
    }
  });
  _cache.set(url, promise);
  return promise;
}

/** Vacía la caché de modelos (cambios en caliente y pruebas). */
export function clearModelCache() {
  _cache.clear();
}

/**
 * Normaliza la configuración de rutas de un modelo: acepta una cadena, una
 * lista de candidatas o `null`. Se filtra cualquier valor no textual.
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
export function normalizeModelPaths(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item) => typeof item === 'string' && item.trim().length > 0);
}

/**
 * Prueba varias candidatas en orden y devuelve la primera que carga. Es lo que
 * permite tener una copia local del modelo, una URL remota (p. ej. el CDN de
 * SupaVoxel) y el asset procedural como cadena de respaldo.
 * @param {string|string[]} paths
 * @returns {Promise<{ gltf: import('three').GLTF|null, path: string|null }>}
 */
export async function loadModelCandidates(paths) {
  for (const path of normalizeModelPaths(paths)) {
    const gltf = await loadModel(path); // eslint-disable-line no-await-in-loop
    if (gltf) return { gltf, path };
  }
  return { gltf: null, path: null };
}

/* --- Personaje jugable (modelo importado de SupaVoxel) --------------------
 * El juego acepta cualquier `.glb`: la copia local tiene prioridad (rápida y
 * disponible sin conexión) y, si falta, se prueba la URL original del CDN.
 * `scripts/fetch-player-model.mjs` descarga esa URL a la ruta local.
 */
/** Ruta local del modelo del jugador (se crea con `npm run assets:player`). */
export const PLAYER_MODEL_LOCAL_PATH = 'models/ranger-supavoxel.glb';
/** URL original del modelo generado en SupaVoxel (embed cmtw2haaq0biajq9o0ay225br). */
export const PLAYER_MODEL_REMOTE_URL =
  'https://cdn.supavoxel.com/users/V93uvbFB8cOlJCbZLf8wryMIcaXA9XJx/models/3a833456-7355-4fcd-8f76-427d711a67d6_textured.glb';
/** Procedencia declarada del asset (documentación y diagnósticos). */
export const PLAYER_MODEL_SOURCE = 'SupaVoxel — modelo 3D generado con IA';

/**
 * Manifiesto de modelos por defecto. Se puede sobrescribir con
 * `public/config/models.json` (misma estrategia de datos desacoplados que el
 * resto del motor). Cada entrada mapea una entidad a su `.glb` (o a una lista
 * de candidatas en `paths`), las animaciones disponibles (nombres de clips
 * dentro del asset) y el ajuste opcional de escala/orientación (`fit`).
 */
export const DEFAULT_MODELS = {
  npc: {
    path: 'models/npc.glb',
    animations: { idle: 'Idle', walk: 'Walk', talk: 'Talk' },
  },
  ranger: {
    // Personaje jugable DE RESPALDO: el aspecto principal del guardián lo
    // monta `CharacterSystem` con el pack `media/glTF`
    // (config/characters.json). Si el pack no está disponible, `paths` se
    // prueba en orden: copia local opcional (`npm run assets:player`) y el
    // ranger procedural del repositorio, siempre presente.
    path: PLAYER_MODEL_LOCAL_PATH,
    paths: [PLAYER_MODEL_LOCAL_PATH, 'models/ranger.glb'],
    animations: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump' },
    // Los assets externos no vienen en metros ni miran a +Z: `fit` los ajusta.
    fit: { height: 1.85, center: true, ground: 0, rotation: { x: 0, y: 0, z: 0 } },
    source: 'Personaje de respaldo (descargable o procedural)',
  },
  animals: {
    erizo: { path: 'models/animals/erizo.glb', animations: { idle: 'Idle' } },
    jabali: { path: 'models/animals/jabali.glb', animations: { idle: 'Idle' } },
    gavina: { path: 'models/animals/gaviota.glb', animations: { idle: 'Fly', walk: 'Walk' } },
    conejo: { path: 'models/animals/conejo.glb', animations: { idle: 'Idle' } },
    gato: { path: 'models/animals/gato.glb', animations: { idle: 'Idle' } },
    mochuelo: { path: 'models/animals/mochuelo.glb', animations: { idle: 'Idle' } },
    garza: { path: 'models/animals/garza.glb', animations: { idle: 'Idle' } },
    paloma: { path: 'models/animals/paloma.glb', animations: { idle: 'Idle' } },
  },
};

let _manifest = null;

/** Vacía el manifiesto en caché (relevante en pruebas y recargas en caliente). */
export function resetModelsManifest() {
  _manifest = null;
}

/**
 * Combina una entrada del JSON con la del manifiesto por defecto. Es una mezcla
 * por campo (no superficial) para que el JSON pueda cambiar sólo el `path` de un
 * modelo sin perder sus animaciones ni su `fit`.
 */
function mergeEntry(base, override) {
  if (!override || typeof override !== 'object') return base;
  if (!base || typeof base !== 'object') return override;
  return {
    ...base,
    ...override,
    animations: { ...(base.animations ?? {}), ...(override.animations ?? {}) },
    fit: { ...(base.fit ?? {}), ...(override.fit ?? {}) },
    paths: normalizeModelPaths(override.paths ?? override.path ?? base.paths ?? base.path),
  };
}

/** Carga `public/config/models.json` (si existe) o devuelve los valores por defecto. */
export async function loadModelsManifest() {
  if (_manifest) return _manifest;
  const defaults = DEFAULT_MODELS;
  try {
    const res = await fetch(configUrl(), { cache: 'no-store' });
    if (!res.ok) {
      _manifest = defaults;
      return _manifest;
    }
    const json = await res.json();
    // Mezcla por entrada: el JSON manda, pero conserva los campos por defecto.
    const animals = {};
    for (const key of Object.keys(defaults.animals ?? {})) {
      animals[key] = mergeEntry(defaults.animals[key], json.animals?.[key]);
    }
    for (const key of Object.keys(json.animals ?? {})) {
      if (!animals[key]) animals[key] = mergeEntry(null, json.animals[key]);
    }
    _manifest = {
      ...defaults,
      ...json,
      npc: mergeEntry(defaults.npc, json.npc),
      ranger: mergeEntry(defaults.ranger, json.ranger),
      animals,
    };
  } catch (e) {
    _manifest = defaults;
  }
  return _manifest;
}
