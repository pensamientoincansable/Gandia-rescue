import * as THREE from 'three';
import {
  GROUND_STYLES, MATERIAL_SETTINGS, MATERIAL_TEXTURES, SATELLITE_TEXTURES, SKY_TEXTURES,
} from './WorldAssets.js';

/**
 * Generador de texturas optimizadas para Three.js.
 *
 * Regla de oro del mundo 3D: **la fotografía satelital sólo se usa en las rutas
 * practicables** (carreteras, caminos y puentes). Todo lo demás —el suelo de
 * cada hábitat, el atrezo, los hitos y la vegetación— se construye con
 * materiales propios a partir de las imágenes de `media/` adaptadas por
 * `scripts/sync-world-assets.mjs`.
 *
 * Cada textura se devuelve de inmediato (base procedural, válida en jsdom y sin
 * red) y se *enriquece* en cuanto la imagen termina de descargarse: se pintan
 * los mapas reales sobre el lienzo y se marca `needsUpdate`. Así el mundo nunca
 * espera a la red y, cuando llega, gana el detalle de las fotos originales.
 */

const textureCache = new Map();
/** Caché de elementos <img> para pintar los mapas sobre los lienzos. */
const imageCache = new Map();

function createFallbackTexture(r = 100, g = 150, b = 130) {
  const data = new Uint8Array([r, g, b, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Textura plana de un color concreto. Se usa como red de seguridad: si la
 * imagen de `media/` no llega a descargarse, el objeto conserva su color en
 * lugar de quedarse negro.
 */
function createSolidTexture(colorHex) {
  const color = new THREE.Color(colorHex ?? 0xcccccc);
  const data = new Uint8Array([
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Sustituye el contenido de una textura por un color plano (error de carga). */
function paintSolidFallback(texture, colorHex) {
  const solid = createSolidTexture(colorHex);
  texture.image = solid.image;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Carga un elemento de imagen (con caché) para poder pintarlo en un canvas.
 * @param {string} url
 * @returns {Promise<HTMLImageElement|null>}
 */
function loadImageElement(url) {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  if (imageCache.has(url)) return imageCache.get(url);

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
  imageCache.set(url, promise);
  return promise;
}

/** Prepara un lienzo de trabajo o devuelve null si no hay DOM (tests). */
function createCanvas(width, height) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  return ctx ? { canvas, ctx } : null;
}

/**
 * Carga una textura de los recursos subidos al repositorio sin fijar una URL
 * absoluta. El manifiesto resuelve cada URL para Vite, `dist` y el bundle
 * `static/` de GitHub Pages.
 */
function createMediaTexture(cacheKey, url, { repeat = [1, 1], wrapT = THREE.RepeatWrapping, fallbackColor = 0xcccccc } = {}) {
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  if (!url || typeof document === 'undefined') return null;

  try {
    const texture = new THREE.TextureLoader().load(
      url,
      (loaded) => { loaded.needsUpdate = true; },
      undefined,
      // Sin imagen: el material mantiene su color en vez de volverse negro.
      () => paintSolidFallback(texture, fallbackColor),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = wrapT;
    texture.repeat.set(...repeat);
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    textureCache.set(cacheKey, texture);
    return texture;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ suelos */

/** Paleta procedural de cada hábitat (base antes de aplicar los mapas). */
const GROUND_PALETTES = {
  platja: { base: '#d9c191', dark: '#b79a63', accent: '#e8d9b3' },
  port: { base: '#8e8d86', dark: '#6f6f69', accent: '#a7a49a' },
  marjal: { base: '#5f7f46', dark: '#3f5a30', accent: '#7d9a55' },
  riu: { base: '#79895c', dark: '#55663f', accent: '#9aa577' },
  casc: { base: '#9c9584', dark: '#79705f', accent: '#b6ab97' },
  montduver: { base: '#7e8567', dark: '#5d6350', accent: '#9aa085' },
};

/** Motivos procedurales por zona: dunas, bancales, adoquines, estratos… */
function paintGroundMotif(ctx, zoneId, size) {
  const palette = GROUND_PALETTES[zoneId] ?? GROUND_PALETTES.marjal;

  if (zoneId === 'platja') {
    // Óndulas de arena y cordón dunar.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    for (let y = 0; y < size; y += 26) {
      ctx.beginPath();
      for (let x = 0; x <= size; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.01) * 9);
      ctx.stroke();
    }
  } else if (zoneId === 'marjal') {
    // Bancales de arroz inundados.
    ctx.strokeStyle = 'rgba(38,64,40,0.55)';
    ctx.lineWidth = 6;
    for (let x = 40; x < size; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,110,120,0.28)';
    for (let y = 60; y < size; y += 190) ctx.fillRect(40, y, size - 80, 70);
  } else if (zoneId === 'casc') {
    // Adoquinado irregular del casco histórico.
    const tile = 34;
    ctx.strokeStyle = 'rgba(90,84,72,0.6)';
    ctx.lineWidth = 2;
    for (let y = 0; y < size; y += tile) {
      const shift = ((y / tile) % 2) * (tile / 2);
      for (let x = -shift; x < size; x += tile) ctx.strokeRect(x, y, tile - 2, tile - 2);
    }
  } else if (zoneId === 'montduver') {
    // Estratos y canchales de la sierra.
    ctx.strokeStyle = 'rgba(150,146,132,0.35)';
    ctx.lineWidth = 4;
    for (let y = 30; y < size; y += 66) {
      ctx.beginPath();
      for (let x = 0; x <= size; x += 48) ctx.lineTo(x, y + Math.sin(x * 0.03) * 16);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,118,108,0.35)';
    for (let i = 0; i < 160; i += 1) {
      const r = 3 + Math.random() * 9;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (zoneId === 'riu') {
    // Cantos rodados del cauce y vegetación de ribera.
    ctx.fillStyle = 'rgba(150,146,128,0.4)';
    for (let i = 0; i < 220; i += 1) {
      const r = 2 + Math.random() * 7;
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, r, r * 0.7, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (zoneId === 'port') {
    // Losas del muelle y juntas de dilatación.
    ctx.strokeStyle = 'rgba(70,72,74,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= size; i += 96) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
  }

  // Manchas orgánicas comunes: rompen la repetición del mapa.
  ctx.save();
  for (let i = 0; i < 90; i += 1) {
    ctx.globalAlpha = 0.05 + Math.random() * 0.08;
    ctx.fillStyle = Math.random() > 0.5 ? palette.dark : palette.accent;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, 20 + Math.random() * 90, 16 + Math.random() * 70, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Textura de suelo por hábitat. **No** usa fotografía satelital: combina los
 * materiales adaptados de `media/` (arena, tierra, hierba, roca…) con un motivo
 * procedural propio de cada zona.
 */
export function createGroundTexture(zoneId) {
  const cacheKey = `ground_${zoneId}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const style = GROUND_STYLES[zoneId] ?? GROUND_STYLES.marjal;
  const palette = GROUND_PALETTES[zoneId] ?? GROUND_PALETTES.marjal;
  const size = 768;
  const surface = createCanvas(size, size);

  if (!surface) {
    const tex = createFallbackTexture(120, 140, 100);
    textureCache.set(cacheKey, tex);
    return tex;
  }

  const { canvas, ctx } = surface;
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, size, size);
  paintGroundMotif(ctx, zoneId, size);
  addNoise(ctx, size, size, 0.1, palette.dark);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(style.repeat, style.repeat);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);

  // Enriquecido diferido: en cuanto cargan los materiales reales se pintan
  // como capa de detalle (multiply) sobre la base procedural.
  const layers = [style.low, style.mid, style.high].filter(Boolean);
  Promise.all(layers.map((kind) => loadImageElement(MATERIAL_TEXTURES[kind]))).then((images) => {
    let painted = false;
    images.filter(Boolean).forEach((image, index) => {
      ctx.save();
      ctx.globalAlpha = index === 0 ? 0.55 : 0.3;
      ctx.globalCompositeOperation = index === 0 ? 'multiply' : 'overlay';
      for (let y = 0; y < size; y += 256) {
        for (let x = 0; x < size; x += 256) ctx.drawImage(image, x, y, 256, 256);
      }
      ctx.restore();
      painted = true;
    });
    if (painted) texture.needsUpdate = true;
  });

  return texture;
}

/* ------------------------------------------------------------------ rutas */

/**
 * Textura de ruta practicable. Es la **única** superficie del mundo 3D que
 * conserva la fotografía satelital: sobre el vuelo de la zona se marca la
 * calzada, los arcenes y la señalización horizontal, de modo que el trazado
 * mantiene la lectura real del territorio.
 */
export function createSatelliteRouteTexture(zoneId, { lanes = true, dirt = false, repeatX = 1, repeatY = 6 } = {}) {
  const cacheKey = `route_${zoneId}_${dirt ? 'dirt' : 'asphalt'}_${lanes ? 'l' : 'n'}_${repeatX}x${repeatY}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const size = 512;
  const surface = createCanvas(size, size);

  if (!surface) {
    const tex = createFallbackTexture(dirt ? 120 : 45, dirt ? 100 : 48, dirt ? 78 : 50);
    textureCache.set(cacheKey, tex);
    return tex;
  }

  const { canvas, ctx } = surface;
  // Base siempre válida (asfalto o tierra apisonada) por si el satélite falla.
  ctx.fillStyle = dirt ? '#7a6144' : '#33363a';
  ctx.fillRect(0, 0, size, size);
  addNoise(ctx, size, size, dirt ? 0.12 : 0.09, dirt ? '#4a3a26' : '#111111');
  paintLaneMarkings(ctx, size, { lanes, dirt });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);

  // Capa satelital: el vuelo real de la zona como arcén, con la calzada
  // marcada encima. Sólo las rutas la usan.
  loadImageElement(SATELLITE_TEXTURES[zoneId] ?? SATELLITE_TEXTURES.platja).then((image) => {
    if (!image) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(image, 0, 0, size, size);
    ctx.restore();

    // Banda de rodadura: oscurece el centro y deja ver el entorno en los bordes.
    const bandWidth = size * (dirt ? 0.52 : 0.62);
    const band = (size - bandWidth) / 2;
    ctx.save();
    ctx.globalAlpha = dirt ? 0.42 : 0.72;
    ctx.fillStyle = dirt ? '#6d5637' : '#2f3235';
    ctx.fillRect(band, 0, bandWidth, size);
    ctx.restore();

    addNoise(ctx, size, size, 0.07, '#000000');
    paintLaneMarkings(ctx, size, { lanes, dirt });
    texture.needsUpdate = true;
  });

  return texture;
}

function paintLaneMarkings(ctx, size, { lanes, dirt }) {
  if (dirt) {
    // Rodadas de los tractores sobre el camino rural.
    ctx.strokeStyle = 'rgba(90,72,48,0.55)';
    ctx.lineWidth = 14;
    for (const x of [size * 0.38, size * 0.62]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    return;
  }
  if (!lanes) return;

  ctx.fillStyle = 'rgba(238,242,245,0.9)';
  ctx.fillRect(size * 0.06, 0, 10, size);
  ctx.fillRect(size * 0.92, 0, 10, size);

  ctx.fillStyle = 'rgba(232,184,53,0.9)';
  for (let y = 12; y < size; y += 96) ctx.fillRect(size * 0.495, y, 9, 52);
}

/** Compatibilidad: la carretera genérica pasa a ser la ruta satelital. */
export function createRoadTexture() {
  return createSatelliteRouteTexture('platja');
}

/* ------------------------------------------------------------------ cielo */

/**
 * Cielo de nubes a partir de los mapas de Elements entregados en /media.
 * El mapa se repite sólo en horizontal sobre la cúpula, evitando una costura
 * visible y conservando el degradado procedural como fallback de seguridad.
 */
export function createSkyTexture(zoneId = 'platja') {
  const cacheKey = `sky_${zoneId}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const supplied = createMediaTexture(cacheKey, SKY_TEXTURES[zoneId] ?? SKY_TEXTURES.day, {
    repeat: [2.2, 1],
    wrapT: THREE.ClampToEdgeWrapping,
  });
  if (supplied) return supplied;

  const fallback = createFallbackTexture(91, 158, 220);
  fallback.wrapS = THREE.RepeatWrapping;
  fallback.repeat.set(2.2, 1);
  textureCache.set(cacheKey, fallback);
  return fallback;
}

/* ------------------------------------------------------------------ materiales de atrezo */

/**
 * Textura de un material de atrezo (`sand`, `wood`, `rock`…).
 * Si la imagen no está disponible todavía, devuelve un color plano con el
 * tinte del material para que la escena siga siendo coherente.
 */
export function createMaterialTexture(kind, { repeat = [1, 1] } = {}) {
  const cacheKey = `mat_${kind}_${repeat.join('x')}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const settings = MATERIAL_SETTINGS[kind] ?? { tint: 0xcccccc };
  const supplied = createMediaTexture(cacheKey, MATERIAL_TEXTURES[kind], {
    repeat,
    fallbackColor: settings.tint,
  });
  if (supplied) return supplied;

  const tex = createSolidTexture(settings.tint ?? 0xcccccc);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  textureCache.set(cacheKey, tex);
  return tex;
}

/**
 * Material estándar de atrezo: mapa adaptado de `media/` + tinte y rugosidad
 * del catálogo. Se cachea por (material, repetición) para compartirlo entre
 * todas las instancias del mismo objeto.
 */
export function createSurfaceMaterial(kind, overrides = {}) {
  const settings = MATERIAL_SETTINGS[kind] ?? {};
  const repeat = overrides.repeat ?? settings.repeat ?? [1, 1];
  const cacheKey = `surf_${kind}_${repeat.join('x')}_${JSON.stringify(overrides)}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const material = new THREE.MeshStandardMaterial({
    map: createMaterialTexture(kind, { repeat }),
    color: overrides.color ?? settings.tint ?? 0xffffff,
    roughness: overrides.roughness ?? settings.roughness ?? 0.85,
    metalness: overrides.metalness ?? settings.metalness ?? 0.05,
    flatShading: overrides.flatShading ?? false,
    dithering: true,
  });
  material.name = `Gandia surface · ${kind}`;
  textureCache.set(cacheKey, material);
  return material;
}

/** Variante con canal alfa para cartelas de vegetación (carrizos, flores…). */
export function createFoliageMaterial(textureUrl, { alphaTest = 0.42, tint = 0xffffff } = {}) {
  const cacheKey = `foliage_${textureUrl}_${alphaTest}_${tint}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const texture = typeof document === 'undefined'
    ? null
    : new THREE.TextureLoader().load(textureUrl, (t) => { t.needsUpdate = true; }, undefined, () => {});
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
  }

  const material = new THREE.MeshStandardMaterial({
    map: texture ?? null,
    color: tint,
    transparent: false,
    alphaTest,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    dithering: true,
  });
  material.name = 'Gandia foliage card';
  textureCache.set(cacheKey, material);
  return material;
}

/* ------------------------------------------------------------------ agua */

/** Textura de agua marina / fluvial con cáusticas y brillos */
export function createWaterTexture(isSea = true, { repeat = [4, 4] } = {}) {
  const cacheKey = `tex_water_${isSea ? 'sea' : 'river'}_${repeat.join('x')}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const surface = createCanvas(512, 512);
  if (!surface) {
    const tex = createFallbackTexture(isSea ? 30 : 45, isSea ? 100 : 110, isSea ? 130 : 90);
    textureCache.set(cacheKey, tex);
    return tex;
  }

  const { canvas, ctx } = surface;
  ctx.fillStyle = isSea ? '#18647e' : '#2b5f54';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = isSea ? 'rgba(180, 235, 245, 0.35)' : 'rgba(160, 230, 205, 0.3)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 28; i++) {
    ctx.beginPath();
    let y = i * 20;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 30) {
      const cy = y + Math.sin((x + i * 15) * 0.04) * 12;
      ctx.lineTo(x, cy);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  textureCache.set(cacheKey, texture);
  return texture;
}

/* ------------------------------------------------------------------ furgoneta */

/** Textura de logotipo y calcomanías de la furgoneta de rescate */
export function createRescueVanDecal() {
  const cacheKey = 'tex_van_decal';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const surface = createCanvas(512, 256);
  if (!surface) {
    const tex = createFallbackTexture(255, 255, 255);
    textureCache.set(cacheKey, tex);
    return tex;
  }
  const { canvas, ctx } = surface;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = '#00a88f';
  ctx.fillRect(0, 160, 512, 45);
  ctx.fillStyle = '#f06f3c';
  ctx.fillRect(0, 205, 512, 20);

  ctx.fillStyle = '#0f3832';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillText('GANDÍA RESCATE', 120, 80);

  ctx.fillStyle = '#00a88f';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText('FAUNA & NATURA · LA SAFOR', 120, 115);

  ctx.fillStyle = '#f06f3c';
  ctx.beginPath();
  ctx.arc(60, 85, 36, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(52, 63, 16, 44);
  ctx.fillRect(38, 77, 44, 16);

  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}

/* ------------------------------------------------------------------ utilidades de lienzo */

function addNoise(ctx, width, height, opacity, color = '#000000') {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  for (let i = 0; i < 2800; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const s = 1 + Math.random() * 3;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}
