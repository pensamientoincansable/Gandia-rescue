/*
 * Biblioteca de recursos ambientales entregados con el proyecto.
 *
 * `scripts/sync-world-assets.mjs` adapta una selección de /media/image y
 * /media/models a public/world. En desarrollo y en builds Vite se sirven como
 * /world; en GitHub Pages el bundle autocontenido vive en /static, por lo que
 * se resuelven desde /static/world. Esta pequeña resolución evita rutas
 * absolutas y, además, mantiene este módulo ejecutable directamente en las
 * pruebas Node del motor.
 */

function worldAssetUrl(path) {
  // El bundle que se publica en la raíz carga static/app.js, no el index de
  // Vite; los assets públicos han sido copiados a static/world. Esta condición
  // va antes de file: para que el comprobador de Pages, que importa app.js
  // desde disco, valide también las URLs HTTP publicadas.
  if (/\/static\/(?:app(?:-[^/]*)?\.js|chunks\/)/.test(import.meta.url)) {
    if (typeof document !== 'undefined' && document.baseURI) {
      return new URL(`static/world/${path}`, document.baseURI).href;
    }
    const staticRoot = import.meta.url.includes('/static/chunks/')
      ? import.meta.url.replace(/\/chunks\/[^/]*$/, '/')
      : import.meta.url.replace(/\/[^/]*$/, '/');
    return `${staticRoot}world/${path}`;
  }

  // Los tests de motor importan los módulos fuente directamente desde file:.
  if (import.meta.url.startsWith('file:')) {
    return new URL(`../../public/world/${path}`, import.meta.url).href;
  }

  // Vite dev y dist sirven public/ en la raíz (o la base configurada).
  const base = typeof document !== 'undefined' ? document.baseURI : import.meta.url;
  return new URL(`world/${path}`, base).href;
}

const terrain = (file) => worldAssetUrl(`terrain/${file}`);
const element = (file) => worldAssetUrl(`elements/${file}`);
const treeModel = (file) => worldAssetUrl(`vegetation/${file}.fbx`);
const treeTexture = (file) => worldAssetUrl(`vegetation/${file}.png`);

/** Texturas de suelo por paisaje. Proceden de media/image/Terrain_*. */
export const TERRAIN_TEXTURES = Object.freeze({
  platja: terrain('Terrain_03-512x512.png'),
  port: terrain('Terrain_10-512x512.png'),
  marjal: terrain('Terrain_17-512x512.png'),
  riu: terrain('Terrain_19-512x512.png'),
  casc: terrain('Terrain_21-512x512.png'),
  montduver: terrain('Terrain_15-512x512.png'),
});

/** Repetición ajustada para una lectura rica, pero deliberadamente PS2/arcade. */
export const TERRAIN_TEXTURE_SETTINGS = Object.freeze({
  platja: { repeat: [1.35, 1.35], tint: 0xf2dbac },
  port: { repeat: [1.15, 1.15], tint: 0xb6b9ad },
  marjal: { repeat: [1.22, 1.22], tint: 0xb4cf91 },
  riu: { repeat: [1.3, 1.3], tint: 0xa7c19e },
  casc: { repeat: [1.5, 1.5], tint: 0xc7b39c },
  montduver: { repeat: [1.22, 1.22], tint: 0xaeb7a2 },
});

/** Mapas de cielo procedentes de media/image/Elements_*. */
export const SKY_TEXTURES = Object.freeze({
  platja: element('Elements_01-512x512.png'),
  port: element('Elements_03-512x512.png'),
  marjal: element('Elements_05-512x512.png'),
  riu: element('Elements_05-512x512.png'),
  casc: element('Elements_03-512x512.png'),
  montduver: element('Elements_01-512x512.png'),
  day: element('Elements_01-512x512.png'),
  sunset: element('Elements_05-512x512.png'),
  night: element('Elements_07-512x512.png'),
});

/** Recursos concretos para las tres variantes de suelo del refugio. */
export const SHELTER_TEXTURES = Object.freeze({
  ground: Object.freeze({
    hierba: terrain('Terrain_13-512x512.png'),
    arena: terrain('Terrain_03-512x512.png'),
    tierra: terrain('Terrain_22-512x512.png'),
  }),
  sky: Object.freeze({
    dia: SKY_TEXTURES.day,
    atardecer: SKY_TEXTURES.sunset,
    noche: SKY_TEXTURES.night,
  }),
});

/* Vegetación FBX + su atlas PNG ------------------------------------ */
/*
 * Cada modelo y textura conserva su identificador de origen. Los FBX son
 * low-poly, por lo que sus siluetas ricas encajan con un look PS2 sin tener
 * que recurrir a copas cónicas que parecían sombrillas.
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
  coastal: vegetation('tree02', 0.0061),
  coastalTall: vegetation('tree04', 0.0059),
  pine: vegetation('tree06', 0.0060),
  pineTall: vegetation('tree08', 0.0056),
  pineSilver: vegetation('tree10', 0.0060),
  pineDark: vegetation('tree12', 0.0061),
  orchard: vegetation('tree15', 0.0058),
  orchardTall: vegetation('tree16', 0.0056),
  riparian: vegetation('tree18', 0.0059),
  urban: vegetation('tree24', 0.0057),
  urbanTall: vegetation('tree28', 0.0058),
  riverShade: vegetation('tree32', 0.0058),
  bush: vegetation('bush01', 0.0064),
  bushFlower: vegetation('bush04', 0.0063),
  bushDark: vegetation('bush07', 0.0064),
});

/** PNGs empleados también como vegetación decorativa del refugio 2.5D. */
export const SHELTER_TREE_SPRITES = Object.freeze([
  VEGETATION_ASSETS.coastalTall.textureUrl,
  VEGETATION_ASSETS.orchard.textureUrl,
  VEGETATION_ASSETS.riparian.textureUrl,
  VEGETATION_ASSETS.urban.textureUrl,
]);
