/*
 * Biblioteca de recursos ambientales entregados con el proyecto.
 *
 * `scripts/sync-world-assets.mjs` adapta una selección de /media/image y
 * /media/models a public/world (reescalado y recodificado). En desarrollo y en
 * builds Vite se sirven como /world; en GitHub Pages el bundle autocontenido
 * vive en /static, por lo que se resuelven desde /static/world. Esta pequeña
 * resolución evita rutas absolutas y, además, mantiene este módulo ejecutable
 * directamente en las pruebas Node del motor.
 *
 * Regla de diseño del mundo 3D:
 *   · SATÉLITE  → sólo las rutas practicables (carreteras, caminos, puentes).
 *   · MATERIAL  → el suelo y todo el atrezo se construyen con materiales
 *                 propios por hábitat y modelos (FBX de vegetación + .glb
 *                 de atrezo e hitos), nunca con primitivas sin textura.
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
const materialAsset = (file) => worldAssetUrl(`materials/${file}.png`);
const treeModel = (file) => worldAssetUrl(`vegetation/${file}.fbx`);
const treeTexture = (file) => worldAssetUrl(`vegetation/${file}.png`);
const propModel = (name) => publicAssetUrl(`models/world/${name}.glb`);

/* ------------------------------------------------------------------ satélite */
/*
 * Fotografía aérea de cada zona. Es la única familia de imágenes satelitales
 * que sigue usando el escenario 3D y se aplica exclusivamente a las rutas
 * practicables: el asfalto, los caminos rurales y los tableros de los puentes.
 */
export const SATELLITE_TEXTURES = Object.freeze({
  platja: satelliteAsset('platja'),
  port: satelliteAsset('port'),
  marjal: satelliteAsset('marjal'),
  riu: satelliteAsset('riu'),
  casc: satelliteAsset('casc'),
  montduver: satelliteAsset('montduver'),
});

/** Alias histórico: el suelo ya no usa satélite, sólo las rutas. */
export const TERRAIN_TEXTURES = SATELLITE_TEXTURES;

/* ------------------------------------------------------------------ materiales */

/**
 * Texturas base de atrezo y suelo. Proceden de media/image y se eligen por su
 * patrón (grano, veta, moteado); el tinte (`tint`) y la rugosidad los aplica
 * el motor según el material concreto que se esté construyendo.
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
});

/**
 * Ajustes de los materiales de atrezo.
 * `repeat` es la repetición del mapa; `tint` reencamina el patrón original de
 * media/ hacia el color real del objeto (arena, madera, terracota…).
 */
export const MATERIAL_SETTINGS = Object.freeze({
  sand: { repeat: [2, 2], tint: 0xe6d2a4, roughness: 0.95 },
  earth: { repeat: [2, 2], tint: 0x8d6f4c, roughness: 0.92 },
  clay: { repeat: [1.5, 1.5], tint: 0xb4703f, roughness: 0.85 },
  grass: { repeat: [2.5, 2.5], tint: 0x7fa355, roughness: 0.9 },
  meadow: { repeat: [2.5, 2.5], tint: 0x8aa35c, roughness: 0.9 },
  marsh: { repeat: [2, 2], tint: 0x6b7a4a, roughness: 0.88 },
  reedbed: { repeat: [2, 2], tint: 0x8a9a52, roughness: 0.9 },
  forest: { repeat: [2, 2], tint: 0x6d7350, roughness: 0.9 },
  rock: { repeat: [1, 1], tint: 0xa7a294, roughness: 0.95 },
  stone: { repeat: [1, 1], tint: 0xa8a396, roughness: 0.9 },
  gravel: { repeat: [1.5, 1.5], tint: 0x9d9a86, roughness: 0.95 },
  cobble: { repeat: [1.5, 1.5], tint: 0x9a9184, roughness: 0.85 },
  wood: { repeat: [1, 1], tint: 0x9c6a3f, roughness: 0.8 },
  timber: { repeat: [1, 1], tint: 0x7a4a2c, roughness: 0.82 },
  metal: { repeat: [1, 1], tint: 0x5d646c, roughness: 0.45, metalness: 0.55 },
  plaster: { repeat: [1, 1], tint: 0xe0d8c4, roughness: 0.9 },
  cloth: { repeat: [1, 1], tint: 0xd96a3a, roughness: 0.75 },
  canvas: { repeat: [1, 1], tint: 0x2f7f96, roughness: 0.75 },
  rust: { repeat: [1, 1], tint: 0x8d5a35, roughness: 0.8, metalness: 0.2 },
  tile: { repeat: [1.5, 1.5], tint: 0xb06540, roughness: 0.8 },
  salt: { repeat: [2, 2], tint: 0xbfc0a6, roughness: 0.9 },
  scrub: { repeat: [2, 2], tint: 0x77864f, roughness: 0.9 },
});

/* ------------------------------------------------------------------ cielos */

/** Mapas de cielo procedentes de media/image/Elements_*. */
export const SKY_TEXTURES = Object.freeze({
  day: skyAsset('day'),
  dayAlt: skyAsset('sunset-2'),
  sunset: skyAsset('sunset'),
  night: skyAsset('night'),
  // Reparto por zona (amaneceres cálidos en la costa, celajes altos en la sierra).
  platja: skyAsset('day'),
  port: skyAsset('sunset-2'),
  marjal: skyAsset('sunset'),
  riu: skyAsset('sunset'),
  casc: skyAsset('sunset-2'),
  montduver: skyAsset('day'),
});

/**
 * Recursos concretos para las tres variantes de suelo del refugio.
 * También aquí se abandona la foto de satélite: las losetas usan los mismos
 * materiales de hierba, arena y tierra que el mundo 3D.
 */
export const SHELTER_TEXTURES = Object.freeze({
  ground: Object.freeze({
    hierba: materialAsset('grass'),
    arena: materialAsset('sand'),
    tierra: materialAsset('earth'),
  }),
  sky: Object.freeze({
    dia: SKY_TEXTURES.day,
    atardecer: SKY_TEXTURES.sunset,
    noche: SKY_TEXTURES.night,
  }),
});

/* ------------------------------------------------------------------ suelos */
/*
 * El terreno ya no se pinta con la foto de satélite: cada hábitat combina
 * materiales propios (arena, tierra, hierba, roca…) con un reparto por altura
 * y pendiente, de modo que la montaña muestra roca en las fuertes pendientes y
 * la marjal mantiene el verde encharcado.
 */
export const GROUND_STYLES = Object.freeze({
  platja: Object.freeze({
    low: 'sand', mid: 'sand', high: 'scrub', steep: 'rock',
    tint: 0xf0dcb0, repeat: 16, waterTint: 0x2e93a8, flatShading: false,
  }),
  port: Object.freeze({
    low: 'stone', mid: 'stone', high: 'stone', steep: 'stone',
    tint: 0xb9b4a6, repeat: 14, waterTint: 0x1d5869, flatShading: false,
  }),
  marjal: Object.freeze({
    low: 'marsh', mid: 'reedbed', high: 'grass', steep: 'earth',
    tint: 0xa8c07c, repeat: 15, waterTint: 0x256658, flatShading: true,
  }),
  riu: Object.freeze({
    low: 'gravel', mid: 'grass', high: 'meadow', steep: 'rock',
    tint: 0xb2c096, repeat: 15, waterTint: 0x31695f, flatShading: false,
  }),
  casc: Object.freeze({
    low: 'cobble', mid: 'cobble', high: 'stone', steep: 'stone',
    tint: 0xcfc4ad, repeat: 18, waterTint: 0x3ab4c8, flatShading: false,
  }),
  montduver: Object.freeze({
    low: 'scrub', mid: 'forest', high: 'rock', steep: 'rock',
    tint: 0xb3b39a, repeat: 13, waterTint: 0x2f6f78, flatShading: true,
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
 * imágenes adaptadas de `media/`.
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
