/*
 * Biblioteca de recursos ambientales entregados con el proyecto.
 *
 * `scripts/sync-world-assets.mjs` adapta una selección de /media/textures,
 * /media/image, /Panorama y /Cubemap a public/world (reescalado y recodificado).
 * En desarrollo y en builds Vite se sirven como /world; en GitHub Pages el
 * bundle autocontenido vive en /static, por lo que se resuelven desde
 * /static/world. Esta pequeña resolución evita rutas absolutas y, además,
 * mantiene este módulo ejecutable directamente en las pruebas Node del motor.
 *
 * Regla de diseño del mundo 3D:
 *   · SATÉLITE     → publicado por compatibilidad; las rutas se pintan ahora
 *                    con el asfalto de media/textures.
 *   · MATERIAL     → suelo, rutas y atrezo usan la biblioteca fotográfica de
 *                    media/textures (Bricks, Grass, Roofs, Stone, Tile, Wood,
 *                    Elements) más los modelos FBX de vegetación.
 *   · CIELO        → ciclo día/noche de 10 fases: panorama equirrectangular
 *                    para la cúpula y cubemap para la iluminación de entorno.
 */

/** Resuelve cualquier recurso servido desde `public/`. */
function publicAssetUrl(path) {
  // El bundle que se publica en la raíz carga static/app.js, no el index de
  // Vite; los assets públicos han sido copiados a static/. Esta condición
  // va antes de file: para que el comprobador de Pages, que importa app.js
  // desde disco, valide también las URLs HTTP publicadas.
  if (/\/static\/(?:app(?:-[^/]*)?\.js|chunks\/)/.test(import.meta.url)) {
    if (typeof document !== 'undefined' && document.baseURI) {
      return new URL(`static/${path}`, document.baseURI).href;
    }
    const staticRoot = import.meta.url.includes('/static/chunks/')
      ? import.meta.url.replace(/\/chunks\/[^/]*$/, '/')
      : import.meta.url.replace(/\/[^/]*$/, '/');
    return `${staticRoot}${path}`;
  }

  // Los tests de motor importan los módulos fuente directamente desde file:.
  if (import.meta.url.startsWith('file:')) {
    return new URL(`../../public/${path}`, import.meta.url).href;
  }

  // Vite dev y dist sirven public/ en la raíz (o la base configurada).
  const base = typeof document !== 'undefined' ? document.baseURI : import.meta.url;
  return new URL(path, base).href;
}

/** Recursos ambientales (public/world). */
function worldAssetUrl(path) {
  return publicAssetUrl(`world/${path}`);
}

const satelliteAsset = (file) => worldAssetUrl(`satellite/${file}.png`);
const skyAsset = (file) => worldAssetUrl(`sky/${file}.png`);
const skyPanoAsset = (phase) => worldAssetUrl(`sky/pano/${phase}.png`);
const skyCubeAsset = (phase, face) => worldAssetUrl(`sky/cube/${phase}-${face}.png`);
const materialAsset = (file) => worldAssetUrl(`materials/${file}.png`);
const treeModel = (file) => worldAssetUrl(`vegetation/${file}.fbx`);
const treeTexture = (file) => worldAssetUrl(`vegetation/${file}.png`);
const propModel = (name) => publicAssetUrl(`models/world/${name}.glb`);

/* ------------------------------------------------------------------ satélite */

/*
 * Fotografía aérea de cada zona. Se conserva publicada por compatibilidad con
 * el manifiesto y las pruebas; el mundo 3D ya no la usa: las rutas se pintan
 * con los materiales de media/textures (ver GROUND_STYLES y TextureFactory).
 */
export const SATELLITE_TEXTURES = Object.freeze({
  platja: satelliteAsset('platja'),
  port: satelliteAsset('port'),
  marjal: satelliteAsset('marjal'),
  riu: satelliteAsset('riu'),
  casc: satelliteAsset('casc'),
  montduver: satelliteAsset('montduver'),
});

/** Alias histórico: el suelo ya no usa satélite. */
export const TERRAIN_TEXTURES = SATELLITE_TEXTURES;

/* ------------------------------------------------------------------ materiales */

/**
 * Texturas base de suelo, rutas y atrezo. Proceden de la biblioteca
 * fotográfica de `media/textures` (Bricks, Grass, Roofs, Stone, Tile, Wood y
 * Elements para el agua); el tinte (`tint`) y la rugosidad los aplica el motor
 * según el material concreto que se esté construyendo.
 */
export const MATERIAL_TEXTURES = Object.freeze({
  sand: materialAsset('sand'),
  earth: materialAsset('earth'),
  clay: materialAsset('clay'),
  grass: materialAsset('grass'),
  meadow: materialAsset('meadow'),
  marsh: materialAsset('marsh'),
  reedbed: materialAsset('reedbed'),
  forest: materialAsset('forest'),
  rock: materialAsset('rock'),
  stone: materialAsset('stone'),
  gravel: materialAsset('gravel'),
  cobble: materialAsset('cobble'),
  wood: materialAsset('wood'),
  timber: materialAsset('timber'),
  metal: materialAsset('metal'),
  plaster: materialAsset('plaster'),
  cloth: materialAsset('cloth'),
  canvas: materialAsset('canvas'),
  rust: materialAsset('rust'),
  tile: materialAsset('tile'),
  salt: materialAsset('salt'),
  scrub: materialAsset('scrub'),
  // Nuevos: calzada asfaltada y agua real (mar y río) desde media/textures.
  asphalt: materialAsset('asphalt'),
  'water-sea': materialAsset('water-sea'),
  'water-river': materialAsset('water-river'),
});

/**
 * Ajustes de los materiales de suelo y atrezo.
 * `repeat` es la repetición del mapa; `tint` es ahora un ajuste fino sobre la
 * fotografía (los mapas ya traen su color real), y `roughness`/`metalness`
 * describen la respuesta de la superficie.
 */
export const MATERIAL_SETTINGS = Object.freeze({
  sand: { repeat: [3, 3], tint: 0xe8d8ac, roughness: 0.95 },
  earth: { repeat: [2.5, 2.5], tint: 0xcbb597, roughness: 0.94 },
  clay: { repeat: [2, 2], tint: 0xc99e6a, roughness: 0.9 },
  grass: { repeat: [3, 3], tint: 0x94b06a, roughness: 0.92 },
  meadow: { repeat: [3, 3], tint: 0xa4b473, roughness: 0.92 },
  marsh: { repeat: [2.5, 2.5], tint: 0x93a06b, roughness: 0.9 },
  reedbed: { repeat: [2.5, 2.5], tint: 0xc0b578, roughness: 0.92 },
  forest: { repeat: [2.5, 2.5], tint: 0x87a06a, roughness: 0.92 },
  rock: { repeat: [1.5, 1.5], tint: 0xb8b6ae, roughness: 0.96 },
  stone: { repeat: [1.5, 1.5], tint: 0xc4c0b4, roughness: 0.92 },
  gravel: { repeat: [2, 2], tint: 0xc9c4b4, roughness: 0.95 },
  cobble: { repeat: [2, 2], tint: 0xc0b49c, roughness: 0.9 },
  wood: { repeat: [1.5, 1.5], tint: 0xcbb290, roughness: 0.82 },
  timber: { repeat: [1.5, 1.5], tint: 0x8f6f52, roughness: 0.84 },
  metal: { repeat: [1, 1], tint: 0x9aa4ac, roughness: 0.45, metalness: 0.6 },
  plaster: { repeat: [1.5, 1.5], tint: 0xece7dc, roughness: 0.9 },
  cloth: { repeat: [1, 1], tint: 0xe08a52, roughness: 0.78 },
  canvas: { repeat: [1, 1], tint: 0x7fb2c0, roughness: 0.78 },
  rust: { repeat: [1.5, 1.5], tint: 0xc08a58, roughness: 0.82, metalness: 0.25 },
  tile: { repeat: [1.5, 1.5], tint: 0xcf9a6e, roughness: 0.8 },
  salt: { repeat: [2.5, 2.5], tint: 0xe4e6e2, roughness: 0.9 },
  scrub: { repeat: [2.5, 2.5], tint: 0xb0a887, roughness: 0.94 },
  asphalt: { repeat: [1, 1], tint: 0xffffff, roughness: 0.94, metalness: 0.05 },
  'water-sea': { repeat: [6, 6], tint: 0xdff4f2, roughness: 0.24, metalness: 0.35 },
  'water-river': { repeat: [5, 5], tint: 0xd8ecdf, roughness: 0.3, metalness: 0.28 },
});

/* ------------------------------------------------------------------ ciclo día/noche */

/**
 * Ciclo completo de 24 h en 10 fases visuales. `pano` es el panorama
 * equirrectangular de la cúpula (Panorama_Sky_NN) y `env` el cubemap
 * de iluminación (6 caras rebanadas de Cubemap_Sky_NN). `sun` es la altura
 * solar normalizada [0..1] de la fase y se usa para modular las luces.
 */
export const DAY_CYCLE = Object.freeze([
  Object.freeze({ id: 'noche', pano: skyPanoAsset('noche'), env: cubeFaces('noche'), sun: 0.0, fog: 0x1a2233 }),
  Object.freeze({ id: 'madrugada', pano: skyPanoAsset('madrugada'), env: cubeFaces('madrugada'), sun: 0.0, fog: 0x2a2840 }),
  Object.freeze({ id: 'alba', pano: skyPanoAsset('alba'), env: cubeFaces('alba'), sun: 0.12, fog: 0xcabec4 }),
  Object.freeze({ id: 'amanecer', pano: skyPanoAsset('amanecer'), env: cubeFaces('amanecer'), sun: 0.3, fog: 0xe8c9a8 }),
  Object.freeze({ id: 'manana', pano: skyPanoAsset('manana'), env: cubeFaces('manana'), sun: 0.62, fog: 0xc7dcea }),
  Object.freeze({ id: 'mediodia', pano: skyPanoAsset('mediodia'), env: cubeFaces('mediodia'), sun: 1.0, fog: 0xaad8e6 }),
  Object.freeze({ id: 'tarde', pano: skyPanoAsset('tarde'), env: cubeFaces('tarde'), sun: 0.68, fog: 0xbdd8e2 }),
  Object.freeze({ id: 'atardecer', pano: skyPanoAsset('atardecer'), env: cubeFaces('atardecer'), sun: 0.34, fog: 0xe6cf9f }),
  Object.freeze({ id: 'ocaso', pano: skyPanoAsset('ocaso'), env: cubeFaces('ocaso'), sun: 0.14, fog: 0xd9a184 }),
  Object.freeze({ id: 'crepusculo', pano: skyPanoAsset('crepusculo'), env: cubeFaces('crepusculo'), sun: 0.03, fog: 0x6f6a8c }),
]);

const PHASE_INDEX = new Map(DAY_CYCLE.map((phase, index) => [phase.id, index]));

/** Índice de una fase por identificador (respaldo: mediodía). */
export function dayCycleIndex(phaseId) {
  return PHASE_INDEX.get(phaseId) ?? 5;
}

/** Identificador de la fase siguiente a `phaseId` (ciclo de 10). */
export function nextDayCyclePhaseId(phaseId) {
  const index = dayCycleIndex(phaseId);
  return DAY_CYCLE[(index + 1) % DAY_CYCLE.length].id;
}

/** Caras del cubemap publicadas para una fase. */
function cubeFaces(phase) {
  return Object.freeze({
    px: skyCubeAsset(phase, 'px'),
    nx: skyCubeAsset(phase, 'nx'),
    py: skyCubeAsset(phase, 'py'),
    ny: skyCubeAsset(phase, 'ny'),
    pz: skyCubeAsset(phase, 'pz'),
    nz: skyCubeAsset(phase, 'nz'),
  });
}

/** Número de fases del ciclo (10). */
export const DAY_CYCLE_LENGTH = DAY_CYCLE.length;

/**
 * Cielos cuadrados de respaldo (jsdom, fallbacks) y variantes del refugio 2.5D.
 * Se mantienen publicados desde media/image/Elements_*.
 */
export const SKY_TEXTURES = Object.freeze({
  day: skyAsset('day'),
  dayAlt: skyAsset('sunset-2'),
  sunset: skyAsset('sunset'),
  night: skyAsset('night'),
});

/**
 * Recursos concretos para las tres variantes de suelo y cielo del refugio 2.5D.
 * El cielo usa ahora los panoramas reales del ciclo (mediodía, ocaso, noche).
 */
export const SHELTER_TEXTURES = Object.freeze({
  ground: Object.freeze({
    hierba: materialAsset('grass'),
    arena: materialAsset('sand'),
    tierra: materialAsset('earth'),
  }),
  sky: Object.freeze({
    dia: skyPanoAsset('mediodia'),
    atardecer: skyPanoAsset('ocaso'),
    noche: skyPanoAsset('noche'),
  }),
});

/* ------------------------------------------------------------------ suelos */

/*
 * El terreno se pinta con los materiales fotográficos de media/textures: cada
 * hábitat combina materiales propios (arena, tierra, hierba, roca…) con un
 * reparto por altura y pendiente, de modo que la montaña muestra roca en las
 * fuertes pendientes y la marjal mantiene el verde encharcado.
 */
export const GROUND_STYLES = Object.freeze({
  platja: Object.freeze({
    low: 'sand', mid: 'sand', high: 'scrub', steep: 'rock',
    tint: 0xf6ecd2, repeat: 16, waterTint: 0x9fd8d4, flatShading: false,
  }),
  port: Object.freeze({
    low: 'stone', mid: 'stone', high: 'stone', steep: 'stone',
    tint: 0xd8d5cc, repeat: 14, waterTint: 0x8fc4cc, flatShading: false,
  }),
  marjal: Object.freeze({
    low: 'marsh', mid: 'reedbed', high: 'grass', steep: 'earth',
    tint: 0xd6e0b2, repeat: 15, waterTint: 0x9fc9b4, flatShading: true,
  }),
  riu: Object.freeze({
    low: 'gravel', mid: 'grass', high: 'meadow', steep: 'rock',
    tint: 0xd2d8b8, repeat: 15, waterTint: 0xa4d2c2, flatShading: false,
  }),
  casc: Object.freeze({
    low: 'cobble', mid: 'cobble', high: 'stone', steep: 'stone',
    tint: 0xe0d7c2, repeat: 18, waterTint: 0x9ed2dc, flatShading: false,
  }),
  montduver: Object.freeze({
    low: 'scrub', mid: 'forest', high: 'rock', steep: 'rock',
    tint: 0xd2d2bc, repeat: 13, waterTint: 0x9cc8ce, flatShading: true,
  }),
});

/* ------------------------------------------------------------------ vegetación */

/*
 * Cada modelo y textura conserva su identificador de origen. Los FBX son
 * low-poly con atlas alfa: tronco modelado y copa en cartelas cruzadas, la
 * técnica clásica de la era PS2, que da volumen sin coste de geometría.
 */
const vegetation = (file, scale = 0.006) => Object.freeze({
  modelUrl: treeModel(file),
  textureUrl: treeTexture(file),
  scale,
});

/**
 * Catálogo semántico de especies visuales. No se nombran botánicamente para
 * no afirmar una especie concreta a partir de un asset artístico, pero cada
 * grupo se distribuye conforme al hábitat valenciano de la zona.
 */
export const VEGETATION_ASSETS = Object.freeze({
  // Costa y paseo marítimo
  coastal: vegetation('tree02', 0.0061),
  coastalTall: vegetation('tree04', 0.0059),
  silverFoliage: vegetation('tree10', 0.0060),
  // Huerta y cultivo
  olive: vegetation('tree06', 0.0060),
  oliveTall: vegetation('tree09', 0.0059),
  citrus: vegetation('tree16', 0.0058),
  citrusSmall: vegetation('tree15', 0.0060),
  golden: vegetation('tree13', 0.0060),
  // Ribera del Serpis
  riparian: vegetation('tree18', 0.0059),
  poplar: vegetation('tree26', 0.0056),
  poplarBroad: vegetation('tree20', 0.0058),
  willow: vegetation('tree22', 0.0058),
  riverShade: vegetation('tree35', 0.0058),
  // Casco histórico y puerto
  urban: vegetation('tree14', 0.0057),
  urbanTall: vegetation('tree11', 0.0058),
  // Sierra del Montdúver
  pine: vegetation('tree01', 0.0061),
  pineTall: vegetation('tree05', 0.0060),
  pineDark: vegetation('tree12', 0.0061),
  pineBroad: vegetation('tree08', 0.0060),
  juniper: vegetation('tree27', 0.0062),
  // Caducifolios de acento (otoño / floración)
  autumn: vegetation('tree28', 0.0058),
  autumnRed: vegetation('tree30', 0.0059),
  // Arbustos y matorral
  bush: vegetation('bush02', 0.0064),
  bushFlower: vegetation('bush03', 0.0063),
  bushDark: vegetation('bush08', 0.0064),
  bushDry: vegetation('bush01', 0.0064),
  bushRock: vegetation('bush04', 0.0063),
  bushBroom: vegetation('bush05', 0.0063),
  bushEmber: vegetation('bush07', 0.0064),
  bushDense: vegetation('bush06', 0.0064),
});

/** PNGs empleados también como vegetación decorativa del refugio 2.5D. */
export const SHELTER_TREE_SPRITES = Object.freeze([
  VEGETATION_ASSETS.coastalTall.textureUrl,
  VEGETATION_ASSETS.citrus.textureUrl,
  VEGETATION_ASSETS.riparian.textureUrl,
  VEGETATION_ASSETS.urban.textureUrl,
]);

/* ------------------------------------------------------------------ modelos de atrezo */

/**
 * Modelos `.glb` generados por `scripts/gen-props.mjs`. Son piezas singulares
 * (hitos y mobiliario) con materiales nombrados (`prop.wood`, `prop.stone`…)
 * que el motor reemplaza en caliente por materiales texturizados con las
 * imágenes adaptadas de `media/textures`.
 */
export const PROP_MODELS = Object.freeze({
  fishingBoat: propModel('boat-fishing'),
  lighthouse: propModel('lighthouse'),
  lifeguardTower: propModel('tower-lifeguard'),
  alqueria: propModel('alqueria'),
  collegiate: propModel('collegiate'),
  fountain: propModel('fountain'),
  summitMast: propModel('mast-summit'),
  bridgeArch: propModel('bridge-arch'),
  boardwalk: propModel('boardwalk'),
  jetty: propModel('jetty'),
});
