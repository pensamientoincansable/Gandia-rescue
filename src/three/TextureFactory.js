import * as THREE from 'three';
import { SKY_TEXTURES, TERRAIN_TEXTURES, TERRAIN_TEXTURE_SETTINGS } from './WorldAssets.js';

/**
 * Generador de texturas optimizadas para Three.js.
 *
 * Las bases de los paisajes ya no son sólo ruido procedural: primero usamos
 * los mapas entregados en `media/image` y dejamos los canvas como respaldo
 * offline para tests o navegadores que no puedan cargar imágenes. El contraste
 * y la repetición contenidos conservan una lectura nítida, estilizada y propia
 * de un juego de la era PS2.
 */

const textureCache = new Map();

function createFallbackTexture(r = 100, g = 150, b = 130) {
  const data = new Uint8Array([r, g, b, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Carga una textura de los recursos subidos al repositorio sin fijar una URL
 * absoluta. El manifiesto resuelve cada URL para Vite, `dist` y el bundle
 * `static/` de GitHub Pages.
 */
function createMediaTexture(cacheKey, url, { repeat = [1, 1], wrapT = THREE.RepeatWrapping } = {}) {
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  if (!url || typeof document === 'undefined') return null;

  try {
    const texture = new THREE.TextureLoader().load(url, undefined, undefined, () => { /* respaldo visual: textura procedural */ });
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

/** Textura de terreno estilo satélite para cada zona de Gandía */
export function createSatelliteTerrainTexture(zoneId) {
  const cacheKey = `sat_${zoneId}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  // Mapas de terreno suministrados: marjal, ribera, roca, costa y suelo
  // histórico conservan patrones reconocibles incluso desde la cámara cenital.
  const settings = TERRAIN_TEXTURE_SETTINGS[zoneId] ?? { repeat: [1.2, 1.2] };
  const supplied = createMediaTexture(cacheKey, TERRAIN_TEXTURES[zoneId], settings);
  if (supplied) return supplied;

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) {
    const tex = createFallbackTexture(80, 130, 100);
    textureCache.set(cacheKey, tex);
    return tex;
  }

  canvas.width = 1024;
  canvas.height = 1024;

  if (zoneId === 'platja') {
    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#50564d');
    grad.addColorStop(0.2, '#c8b68a');
    grad.addColorStop(0.4, '#e5d3a5');
    grad.addColorStop(0.72, '#d6be8c');
    grad.addColorStop(0.78, '#3b929c');
    grad.addColorStop(1.0, '#1a5970');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    addNoise(ctx, 1024, 1024, 0.12, '#2f2416');
    addCoastFoam(ctx, 740, 1024);
  } else if (zoneId === 'port') {
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, '#64686b');
    grad.addColorStop(0.4, '#7a7e80');
    grad.addColorStop(0.5, '#495257');
    grad.addColorStop(0.55, '#1e4854');
    grad.addColorStop(1.0, '#10303b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);
    addGridLines(ctx, 0, 0, 512, 1024, 64, '#505356');
    addNoise(ctx, 1024, 1024, 0.08, '#000000');
  } else if (zoneId === 'marjal') {
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, '#557c43');
    grad.addColorStop(0.3, '#749d52');
    grad.addColorStop(0.6, '#4e6d3c');
    grad.addColorStop(0.85, '#3b5530');
    grad.addColorStop(1.0, '#6e8f49');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    drawAgriculturalGrid(ctx, 1024, 1024);
    addNoise(ctx, 1024, 1024, 0.1, '#1b3211');
  } else if (zoneId === 'riu') {
    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#5c7a45');
    grad.addColorStop(0.3, '#7d8e63');
    grad.addColorStop(0.45, '#9fa392');
    grad.addColorStop(0.5, '#3c726a');
    grad.addColorStop(0.55, '#9fa392');
    grad.addColorStop(0.7, '#748b52');
    grad.addColorStop(1.0, '#668046');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);
    addNoise(ctx, 1024, 1024, 0.12, '#2b331c');
  } else if (zoneId === 'casc') {
    ctx.fillStyle = '#9e978b';
    ctx.fillRect(0, 0, 1024, 1024);
    drawCobblestonePattern(ctx, 1024, 1024);
    addNoise(ctx, 1024, 1024, 0.08, '#3a342b');
  } else if (zoneId === 'montduver') {
    const grad = ctx.createRadialGradient(512, 512, 50, 512, 512, 600);
    grad.addColorStop(0, '#c7c2b6');
    grad.addColorStop(0.4, '#8e8b7d');
    grad.addColorStop(0.7, '#4e623b');
    grad.addColorStop(1.0, '#3f522e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);
    drawRockStrata(ctx, 1024, 1024);
    addNoise(ctx, 1024, 1024, 0.15, '#1e2417');
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  textureCache.set(cacheKey, texture);
  return texture;
}

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

/** Textura de carretera / asfalto con marcas viales */
export function createRoadTexture() {
  const cacheKey = 'tex_road';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) {
    const tex = createFallbackTexture(45, 48, 50);
    textureCache.set(cacheKey, tex);
    return tex;
  }

  canvas.width = 512;
  canvas.height = 512;

  ctx.fillStyle = '#2c2e30';
  ctx.fillRect(0, 0, 512, 512);
  addNoise(ctx, 512, 512, 0.08, '#111111');

  ctx.fillStyle = '#f0f3f5';
  ctx.fillRect(20, 0, 14, 512);
  ctx.fillRect(478, 0, 14, 512);

  ctx.fillStyle = '#e8b835';
  for (let y = 10; y < 512; y += 80) {
    ctx.fillRect(250, y, 12, 45);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 8);
  textureCache.set(cacheKey, texture);
  return texture;
}

/** Textura de agua marina / fluvial con cáusticas y brillos */
export function createWaterTexture(isSea = true) {
  const cacheKey = `tex_water_${isSea ? 'sea' : 'river'}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) {
    const tex = createFallbackTexture(isSea ? 30 : 45, isSea ? 100 : 110, isSea ? 130 : 90);
    textureCache.set(cacheKey, tex);
    return tex;
  }

  canvas.width = 512;
  canvas.height = 512;

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
  texture.repeat.set(4, 4);
  textureCache.set(cacheKey, texture);
  return texture;
}

/** Textura de logotipo y calcomanías de la furgoneta de rescate */
export function createRescueVanDecal() {
  const cacheKey = 'tex_van_decal';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) {
    const tex = createFallbackTexture(255, 255, 255);
    textureCache.set(cacheKey, tex);
    return tex;
  }

  canvas.width = 512;
  canvas.height = 256;

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

function addCoastFoam(ctx, coastX, height) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  for (let y = 0; y < height; y += 4) {
    const wave = Math.sin(y * 0.05) * 14 + Math.cos(y * 0.02) * 8;
    const x = coastX + wave;
    ctx.fillRect(x, y, 10 + Math.random() * 12, 3);
  }
}

function addGridLines(ctx, x, y, width, height, step, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let lx = x; lx < x + width; lx += step) {
    ctx.beginPath();
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y + height);
    ctx.stroke();
  }
}

function drawAgriculturalGrid(ctx, width, height) {
  ctx.strokeStyle = '#324a25';
  ctx.lineWidth = 4;
  for (let x = 60; x < width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 80; y < height; y += 140) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawCobblestonePattern(ctx, width, height) {
  ctx.strokeStyle = '#6e675b';
  ctx.lineWidth = 2;
  const tile = 32;
  for (let y = 0; y < height; y += tile) {
    const shift = ((y / tile) % 2) * (tile / 2);
    for (let x = -shift; x < width; x += tile) {
      ctx.strokeRect(x, y, tile - 2, tile - 2);
    }
  }
}

function drawRockStrata(ctx, width, height) {
  ctx.strokeStyle = '#a49f92';
  ctx.lineWidth = 3;
  for (let y = 50; y < height; y += 70) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 60) {
      ctx.lineTo(x, y + Math.sin(x * 0.03) * 18);
    }
    ctx.stroke();
  }
}
