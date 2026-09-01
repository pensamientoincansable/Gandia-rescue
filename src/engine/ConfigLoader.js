/**
 * ConfigLoader — carga asíncrona y cacheada de los ficheros de configuración
 * del juego (`public/config/*.json`) mediante fetch().
 *
 * Responsabilidad única: resolver rutas, cachear promesas y ofrecer un
 * mecanismo de respaldo (fallback) para entornos sin red (tests, SSR, jsdom).
 * Ningún módulo de juego debe hacer fetch() de configuración por su cuenta.
 */

/** Ruta base donde viven los JSON de configuración. */
export const CONFIG_BASE_URL = new URL('./', resolveBase()).href;

function resolveBase() {
  // Con Vite, `import.meta.url` apunta al módulo; los JSON se sirven desde
  // la raíz pública (`/config/`). En builds con `base: './'` respetamos la
  // ruta relativa del documento.
  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL('config/', document.baseURI);
  }
  return new URL('config/', 'http://localhost/');
}

const cache = new Map();

/**
 * Carga un JSON de configuración (cacheado por nombre).
 * @param {string} name Nombre del fichero, p. ej. 'player_stats.json'.
 * @param {object} [fallback] Valor devuelto si la carga falla.
 * @returns {Promise<object>}
 */
export function loadConfig(name, fallback = null) {
  if (cache.has(name)) return cache.get(name);

  const url = new URL(name, CONFIG_BASE_URL).href;
  const promise = (async () => {
    if (typeof fetch !== 'function') {
      if (fallback) return structuredCloneSafe(fallback);
      throw new Error(`[ConfigLoader] fetch() no disponible y sin fallback para ${name}`);
    }
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (fallback) {
        console.warn(`[ConfigLoader] No se pudo cargar ${name} (${err.message}); usando valores por defecto.`);
        return structuredCloneSafe(fallback);
      }
      throw new Error(`[ConfigLoader] Error cargando ${url}: ${err.message}`);
    }
  })();

  cache.set(name, promise);
  return promise;
}

/** Carga en paralelo el paquete completo de configuración del juego. */
export async function loadGameConfig(fallbacks = {}) {
  const [keybindings, playerStats, moveset] = await Promise.all([
    loadConfig('keybindings.json', fallbacks.keybindings),
    loadConfig('player_stats.json', fallbacks.playerStats),
    loadConfig('moveset.json', fallbacks.moveset),
  ]);
  return { keybindings, playerStats, moveset };
}

/** Invalida la caché (útil para recarga en caliente desde un editor). */
export function invalidateConfigCache(name) {
  if (name) cache.delete(name);
  else cache.clear();
}

/** Lectura segura de rutas anidadas: get(cfg, 'vehicle.maxSpeed', 24). */
export function get(obj, path, defaultValue) {
  const value = String(path)
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  return value === undefined ? defaultValue : value;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
