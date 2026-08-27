import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/* Panoramas 360°                                                      */
/* ------------------------------------------------------------------ */
/**
 * Los panoramas se importan como assets del bundle en lugar de usar rutas
 * sueltas tipo `panoramas/platja.jpg`. Esas rutas se resolvían respecto al
 * documento, así que sólo funcionaban con el index en la raíz: en GitHub Pages
 * (donde el bundle vive en `static/`) devolvían 404 y el visor 360° se quedaba
 * en negro. Importándolas, Vite emite la URL correcta en cada build.
 */
import panoPlatja from '../assets/panoramas/platja.jpg';
import panoPort from '../assets/panoramas/port.jpg';
import panoMarjal from '../assets/panoramas/marjal.jpg';
import panoRiu from '../assets/panoramas/riu.jpg';
import panoCasc from '../assets/panoramas/casc.jpg';
import panoMontduver from '../assets/panoramas/montduver.jpg';

/* ------------------------------------------------------------------ */
/* Acceso seguro a localStorage                                        */
/* ------------------------------------------------------------------ */
export const safeStorage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* noop */ }
  },
};

export function safeMatchMedia(query) {
  try { return window.matchMedia?.(query) ?? null; } catch { return null; }
}

export const MOBILE_QUERY = '(max-width: 760px), (pointer: coarse)';

/* ------------------------------------------------------------------ */
/* Niveles y XP                                                        */
/* ------------------------------------------------------------------ */
export const XP_PER_LEVEL = 150;
export const MAX_LEVEL = 15;
export const SAFOR_GUARDIAN_TARGET = 6;

export const levelForXp = (xp) => Math.min(MAX_LEVEL, Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1);

export function levelProgress(xp) {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return 1;
  return (xp % XP_PER_LEVEL) / XP_PER_LEVEL;
}

/* ------------------------------------------------------------------ */
/* Zonas 360° de Gandía                                                */
/* ------------------------------------------------------------------ */
export const ZONES = [
  { id: 'platja',    img: panoPlatja,    lat: 38.99450, lng: 0.16380, north: 205, initialYaw: 5 },
  { id: 'port',      img: panoPort,      lat: 38.99020, lng: 0.15460, north: 150, initialYaw: -20 },
  { id: 'marjal',    img: panoMarjal,    lat: 39.00210, lng: 0.15030, north: 310, initialYaw: 30 },
  { id: 'riu',       img: panoRiu,       lat: 38.97010, lng: -0.16200, north: 20, initialYaw: 10 },
  { id: 'casc',      img: panoCasc,      lat: 38.96710, lng: -0.17270, north: 340, initialYaw: 0 },
  { id: 'montduver', img: panoMontduver, lat: 38.91830, lng: -0.22700, north: 80, initialYaw: 15 },
];

/** Conexiones a pie entre panoramas (navegación estilo Street View). */
export const ZONE_LINKS = {
  platja:    [{ to: 'port', yaw: 55 }, { to: 'marjal', yaw: -95 }],
  port:      [{ to: 'platja', yaw: -75 }, { to: 'riu', yaw: 170 }],
  marjal:    [{ to: 'platja', yaw: 85 }, { to: 'riu', yaw: -140 }],
  riu:       [{ to: 'marjal', yaw: 125 }, { to: 'port', yaw: -165 }, { to: 'casc', yaw: -35 }],
  casc:      [{ to: 'riu', yaw: 55 }, { to: 'montduver', yaw: 178 }],
  montduver: [{ to: 'casc', yaw: -20 }],
};

export const zoneById = (id) => ZONES.find((z) => z.id === id) ?? ZONES[0];

/* ------------------------------------------------------------------ */
/* Misiones de rescate (una por zona)                                  */
/* ------------------------------------------------------------------ */
export const CASES = [
  { id: 'cJabali',  zone: 'marjal',    species: 'jabali',  off: [0.0009, -0.0006], best: 'hydrate' },
  { id: 'cErizo',   zone: 'platja',    species: 'erizo',   off: [0.0004, 0.0008],  best: 'treat' },
  { id: 'cGavina',  zone: 'port',      species: 'gavina',  off: [-0.0005, 0.0007], best: 'treat' },
  { id: 'cConill',  zone: 'riu',       species: 'conejo',  off: [0.0006, -0.0004], best: 'treat' },
  { id: 'cGat',     zone: 'casc',      species: 'gato',    off: [-0.0003, -0.0009], best: 'hydrate' },
  { id: 'cMochuelo', zone: 'montduver', species: 'mochuelo', off: [0.0008, 0.0005], best: 'observe' },
];

export const caseCoords = (c) => {
  const z = zoneById(c.zone);
  return { lat: z.lat + c.off[0], lng: z.lng + c.off[1] };
};

export const caseById = (id) => CASES.find((c) => c.id === id);

/* ------------------------------------------------------------------ */
/* Especies (colección + visitantes del refugio)                       */
/* ------------------------------------------------------------------ */
export const SPECIES = [
  { id: 'erizo',    latin: 'Erinaceus europaeus',     tags: ['protected', 'cautious'], emoji: '🦔', need: { any: ['arbusto', 'charca'] } },
  { id: 'paloma',   latin: 'Columba livia',           tags: ['common', 'urban'],       emoji: '🕊️', need: { any: ['comedero'] } },
  { id: 'gato',     latin: 'Felis catus',             tags: ['common', 'urban'],       emoji: '🐱', need: { all: ['cabana', 'comedero'] } },
  { id: 'jabali',   latin: 'Sus scrofa',              tags: ['common', 'cautious'],    emoji: '🐗', need: { all: ['charca'] } },
  { id: 'conejo',   latin: 'Oryctolagus cuniculus',   tags: ['common', 'cautious'],    emoji: '🐰', need: { any: ['flores'] } },
  { id: 'mochuelo', latin: 'Athene noctua',           tags: ['protected', 'cautious'], emoji: '🦉', need: { all: ['cajanido'] } },
  { id: 'gavina',   latin: 'Larus michahellis',       tags: ['common', 'urban'],       emoji: '🐦', need: { any: ['bebedero', 'charca'] } },
  { id: 'garza',    latin: 'Ardea cinerea',           tags: ['protected', 'cautious'], emoji: '🦢', need: { all: ['charca', 'palmera'] } },
];

export const speciesById = (id) => SPECIES.find((s) => s.id === id);

export const photoCount = (save) => Object.values(save.photos ?? {}).reduce((n, list) => n + list.length, 0);

export const AVATARS = ['🦊', '🐱', '🦉', '🦔', '🐰', '🐗'];

/* ------------------------------------------------------------------ */
/* Refugio: catálogo, desbloqueos y animales                           */
/* ------------------------------------------------------------------ */
export const SHELTER_ITEMS = [
  { id: 'cabana',   level: 1 },
  { id: 'comedero', level: 1 },
  { id: 'valla',    level: 2 },
  { id: 'bebedero', level: 2 },
  { id: 'arbusto',  level: 3 },
  { id: 'naranjo',  level: 3 },
  { id: 'camino',   level: 4 },
  { id: 'cajanido', level: 4 },
  { id: 'charca',   level: 5 },
  { id: 'flores',   level: 6 },
  { id: 'farol',    level: 7 },
  { id: 'palmera',  level: 8 },
  { id: 'sombra',   level: 9 },
  { id: 'fuente',   level: 10 },
];

export const GROUNDS = [
  { id: 'hierba', level: 1 },
  { id: 'arena',  level: 5 },
  { id: 'tierra', level: 8 },
];

export const SKIES = ['dia', 'atardecer', 'noche'];
export const GRID_BASE = 7;
export const GRID_BIG = 9;
export const GRID_BIG_LEVEL = 6;

/** Elementos desbloqueados al alcanzar un nivel (para el aviso de subida). */
export function unlocksAtLevel(level) {
  const items = SHELTER_ITEMS.filter((i) => i.level === level).map((i) => i.id);
  const grounds = GROUNDS.filter((g) => g.level === level).map((g) => g.id);
  const extras = [];
  if (level === GRID_BIG_LEVEL) extras.push('grid');
  return { items, grounds, extras };
}

export function itemUnlocked(itemId, level) {
  const item = SHELTER_ITEMS.find((i) => i.id === itemId);
  return item ? level >= item.level : false;
}

export function groundUnlocked(groundId, level) {
  const g = GROUNDS.find((x) => x.id === groundId);
  return g ? level >= g.level : false;
}

/* ------------------------------------------------------------------ */
/* Geodesia                                                            */
/* ------------------------------------------------------------------ */
const R_EARTH = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rumbo inicial desde `a` hacia `b`, en grados 0-360 desde el norte. */
export function bearingDeg(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/* ------------------------------------------------------------------ */
/* Estado persistente de la partida                                    */
/* ------------------------------------------------------------------ */
const SAVE_KEY = 'gandia-save-v2';

export const defaultSave = () => ({
  v: 2,
  profile: null,                       // { name, avatar, createdAt }
  xp: 0,
  rescues: 0,                          // nº de rescates completados
  cases: {},                           // { caseId: veces completado }
  species: [],                         // ids de fichas desbloqueadas
  photos: {},                          // { zoneId: [{id, src, ts}] }
  photoXpZones: [],                    // zonas con +15 XP por primera foto
  visited: [],                         // zonas descubiertas
  shelter: { placed: [], ground: 'hierba', sky: 'dia', met: [] },
});

function loadSave() {
  const raw = safeStorage.get(SAVE_KEY);
  if (!raw) return defaultSave();
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultSave(), ...parsed, shelter: { ...defaultSave().shelter, ...(parsed.shelter ?? {}) } };
  } catch {
    return defaultSave();
  }
}

const MAX_PHOTOS_PER_ZONE = 10;
const PHOTO_MAX_EDGE = 900;

/** Reduce una imagen a JPEG pequeño para poder guardarla en localStorage. */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) return reject(new Error('type'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Estado global de la partida con persistencia automática.
 * Las acciones son síncronas: leen y escriben un ref que siempre refleja el
 * estado más reciente (los updaters de setState son asíncronos en React).
 * Devuelve [save, actions].
 */
export function useGame() {
  const [save, setSaveState] = useState(loadSave);
  const saveRef = useRef(save);

  const commit = useCallback((next) => {
    saveRef.current = next;
    setSaveState(next);
  }, []);

  useEffect(() => {
    safeStorage.set(SAVE_KEY, JSON.stringify(save));
  }, [save]);

  const actions = useMemo(() => ({
    createProfile(name, avatar) {
      commit({ ...saveRef.current, profile: { name: name.trim().slice(0, 22), avatar, createdAt: Date.now() } });
    },
    updateProfile(name, avatar) {
      const s = saveRef.current;
      commit({ ...s, profile: { ...s.profile, name: name.trim().slice(0, 22) || s.profile.name, avatar } });
    },
    awardXp(amount) {
      const s = saveRef.current;
      const levelBefore = levelForXp(s.xp);
      const xp = Math.max(0, s.xp + Math.round(amount));
      const levelAfter = levelForXp(xp);
      const unlocked = levelAfter > levelBefore ? unlocksAtLevel(levelAfter) : null;
      commit({ ...s, xp });
      return { levelBefore, levelAfter, unlocked };
    },
    completeRescue(caseId, { xp = 0 } = {}) {
      const s = saveRef.current;
      const levelBefore = levelForXp(s.xp);
      const xpTotal = Math.max(0, s.xp + Math.round(xp));
      const levelAfter = levelForXp(xpTotal);
      const unlocked = levelAfter > levelBefore ? unlocksAtLevel(levelAfter) : null;
      const cse = caseById(caseId);
      const newSpecies = cse && !s.species.includes(cse.species) ? cse.species : null;
      commit({
        ...s,
        xp: xpTotal,
        rescues: s.rescues + 1,
        cases: { ...s.cases, [caseId]: (s.cases[caseId] ?? 0) + 1 },
        species: newSpecies ? [...s.species, cse.species] : s.species,
      });
      return { levelBefore, levelAfter, unlocked, newSpecies };
    },
    markPhotoXp(zoneId) {
      const s = saveRef.current;
      if (!s.photoXpZones.includes(zoneId)) commit({ ...s, photoXpZones: [...s.photoXpZones, zoneId] });
    },
    addPhoto(zoneId, src) {
      const s = saveRef.current;
      const list = s.photos[zoneId] ?? [];
      if (list.length >= MAX_PHOTOS_PER_ZONE) return false;
      commit({
        ...s,
        photos: { ...s.photos, [zoneId]: [...list, { id: `p${Date.now()}${Math.floor(Math.random() * 1e4)}`, src, ts: Date.now() }] },
      });
      return true;
    },
    removePhoto(zoneId, photoId) {
      const s = saveRef.current;
      commit({ ...s, photos: { ...s.photos, [zoneId]: (s.photos[zoneId] ?? []).filter((p) => p.id !== photoId) } });
    },
    visitZone(zoneId) {
      const s = saveRef.current;
      if (!s.visited.includes(zoneId)) commit({ ...s, visited: [...s.visited, zoneId] });
    },
    placeShelterItem(itemId, x, y) {
      const s = saveRef.current;
      commit({
        ...s,
        shelter: { ...s.shelter, placed: [...s.shelter.placed, { id: `i${Date.now()}${Math.floor(Math.random() * 1e4)}`, item: itemId, x, y }] },
      });
    },
    removeShelterItem(instanceId) {
      const s = saveRef.current;
      commit({ ...s, shelter: { ...s.shelter, placed: s.shelter.placed.filter((p) => p.id !== instanceId) } });
    },
    setShelterGround(ground) {
      const s = saveRef.current;
      commit({ ...s, shelter: { ...s.shelter, ground } });
    },
    setShelterSky(sky) {
      const s = saveRef.current;
      commit({ ...s, shelter: { ...s.shelter, sky } });
    },
    markAnimalMet(speciesId) {
      const s = saveRef.current;
      if (!s.shelter.met.includes(speciesId)) commit({ ...s, shelter: { ...s.shelter, met: [...s.shelter.met, speciesId] } });
    },
    reset() {
      commit(defaultSave());
      safeStorage.remove(SAVE_KEY);
    },
  }), [commit]);

  return [save, actions];
}

/** XP de una acción de rescate. */
export function rescueXp({ action, best, distanceMeters, hasGps, alreadyDone }) {
  const base = { hydrate: 90, treat: 110, observe: 40 }[action] ?? 40;
  let xp = base;
  const flags = [];
  if (action === best) { xp += 30; flags.push('correctAction'); }
  if (hasGps && distanceMeters != null && distanceMeters < 40) { xp += 60; flags.push('proximityBonus'); }
  if (!hasGps) { xp *= 0.6; flags.push('reducedNoGps'); }
  if (alreadyDone) { xp *= 0.3; flags.push('replayReduced'); }
  return { xp: Math.round(xp), flags };
}

/** Utilidad: posición GPS como watchPosition con estado React. */
export function useGeolocation(enabled) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const watchId = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      return undefined;
    }
    if (!navigator.geolocation) { setError('unsupported'); return undefined; }
    setError(null);
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      (err) => setError(err.code === 1 ? 'denied' : 'failed'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [enabled]);

  return { position, error };
}

/** Hook de media query responsive. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => safeMatchMedia(MOBILE_QUERY)?.matches ?? false);
  useEffect(() => {
    const media = safeMatchMedia(MOBILE_QUERY);
    if (!media) return undefined;
    const update = () => setIsMobile(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener?.(update);
    return () => media.removeListener?.(update);
  }, []);
  return isMobile;
}

/** Copia el texto según el idioma con respaldo al español. */
export function useT(language) {
  return useMemo(() => (key) => {
    const table = copyTable(language);
    return table[key] ?? copyTable('es')[key] ?? key;
  }, [language]);
}

import { copy } from './i18n.js';
const tables = { es: copy.es, va: copy.va, en: copy.en };
function copyTable(lang) { return tables[lang] ?? tables.es; }
