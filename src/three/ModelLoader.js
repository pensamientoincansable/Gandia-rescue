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

/**
 * Manifiesto de modelos por defecto. Se puede sobrescribir por completo con
 * `public/config/models.json` (misma estrategia de datos desacoplados que el
 * resto del motor). Cada entrada mapea una entidad a su `.glb` y las
 * animaciones disponibles (nombres de clips dentro del asset).
 */
export const DEFAULT_MODELS = {
  npc: {
    path: 'models/npc.glb',
    animations: { idle: 'Idle', walk: 'Walk', talk: 'Talk' },
  },
  ranger: {
    path: 'models/ranger.glb',
    animations: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump' },
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
    // Mezcla superficial: los campos presentes en el JSON prevalecen.
    _manifest = {
      ...defaults,
      ...json,
      animals: { ...(defaults.animals ?? {}), ...(json.animals ?? {}) },
    };
  } catch (e) {
    _manifest = defaults;
  }
  return _manifest;
}
