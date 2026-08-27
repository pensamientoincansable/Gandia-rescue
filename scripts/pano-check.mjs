/**
 * Comprobación del visor 360°: monta un bundle real en jsdom con un contexto
 * WebGL instrumentado y descargas HTTP reales, y verifica que la imagen
 * equirectangular de cada zona (rescate y exploración) se descarga, se sube
 * como textura y se dibuja en cada fotograma.
 *
 *   node scripts/pano-check.mjs static   → bundle de GitHub Pages (static/app.js)
 *   node scripts/pano-check.mjs dist     → bundle de Vite (dist/assets/main-*.js)
 */
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = resolve(import.meta.dirname, '..');
const target = process.argv[2] ?? 'static';

/* ---------------------------------------------------------------- servidor */
/* `static` se sirve desde la raíz del repositorio para reproducir exactamente
   el despliegue de GitHub Pages (incluido un subdirectorio de proyecto). */
const serveRoot = target === 'dist' ? join(root, 'dist') : root;
const prefix = target === 'dist' ? '' : '/Gandia-rescue';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

const requested = [];
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
  const file = join(serveRoot, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  const ok = existsSync(file) && statSync(file).isFile();
  requested.push({ path, status: ok ? 200 : 404 });
  if (!ok) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const pageUrl = `${origin}${prefix}/`;

/* ------------------------------------------------------------ bundle a usar */
let entryUrl;
if (target === 'dist') {
  const assets = join(root, 'dist', 'assets');
  const entry = readdirSync(assets).find((f) => /^main-.*\.js$/.test(f));
  if (!entry) { console.error('✗ Falta dist/. Ejecuta antes: npx vite build'); process.exit(1); }
  entryUrl = pathToFileURL(join(assets, entry)).href;
} else {
  if (!existsSync(join(root, 'static', 'app.js'))) { console.error('✗ Falta static/app.js. Ejecuta antes: npm run build:static'); process.exit(1); }
  entryUrl = pathToFileURL(join(root, 'static', 'app.js')).href;
}

/* ---------------------------------------------------------------- entorno */
const dom = new JSDOM('<!doctype html><html lang="es"><body><div id="root"></div></body></html>', {
  url: pageUrl,
  pretendToBeVisual: true,
});
const { window } = dom;
for (const key of ['window', 'document', 'navigator', 'FileReader', 'HTMLElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, key, { value: window[key] ?? window.document, configurable: true });
}
Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
window.navigator.geolocation = undefined;

/* Descargas reales: jsdom no carga imágenes, así que `Image` se implementa con
   fetch para que un 404 se comporte igual que en el navegador. */
const imageLoads = [];
class TestImage {
  constructor() { this.onload = null; this.onerror = null; this.width = 2048; this.height = 1024; this._src = ''; }
  get src() { return this._src; }
  set src(value) {
    this._src = value;
    /* Node importa el bundle desde el disco, así que las URLs que el bundle
       resuelve con `import.meta.url` llegan como `file:`. Se traducen a la ruta
       equivalente del sitio publicado y se piden por HTTP: así se comprueba a la
       vez que el asset existe y que queda dentro del árbol desplegado. */
    const resolved = new URL(value, window.document.baseURI);
    let absolute = resolved.href;
    if (resolved.protocol === 'file:') {
      const rel = relative(serveRoot, fileURLToPath(resolved));
      absolute = rel.startsWith('..')
        ? `${origin}${prefix}/__fuera-del-sitio-publicado__/${rel}`
        : `${origin}${prefix}/${rel.split(/[\\/]/).join('/')}`;
    }
    this.resolvedUrl = absolute;
    fetch(absolute)
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        const body = await res.arrayBuffer();
        const ok = res.ok && type.startsWith('image/') && body.byteLength > 1024;
        imageLoads.push({ url: absolute, status: res.status, ok, bytes: body.byteLength });
        if (ok) this.onload?.(); else this.onerror?.(new Error(`HTTP ${res.status}`));
      })
      .catch((err) => { imageLoads.push({ url: absolute, status: 0, ok: false }); this.onerror?.(err); });
  }
}
Object.defineProperty(globalThis, 'Image', { value: TestImage, configurable: true });
window.Image = TestImage;

/* Contexto WebGL instrumentado: registra la textura activa en cada draw. */
const draws = [];
let uploads = 0;
function makeGL() {
  let boundTexture = null;
  const textures = new Map();
  let nextId = 1;
  const K = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5,
    STATIC_DRAW: 6, FLOAT: 7, TEXTURE_2D: 8, RGBA: 9, UNSIGNED_BYTE: 10, CLAMP_TO_EDGE: 11,
    LINEAR: 12, TEXTURE_WRAP_S: 13, TEXTURE_WRAP_T: 14, TEXTURE_MIN_FILTER: 15, TEXTURE_MAG_FILTER: 16,
    COLOR_BUFFER_BIT: 17, TRIANGLES: 18, TEXTURE0: 19, UNPACK_FLIP_Y_WEBGL: 20,
  };
  return {
    ...K,
    isContextLost: () => false,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true, deleteShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true, useProgram() {}, deleteProgram() {},
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {},
    getAttribLocation: () => 0, enableVertexAttribArray() {}, vertexAttribPointer() {},
    getUniformLocation: () => ({}), uniform1i() {}, uniform1f() {}, uniform3fv() {},
    createTexture() { const t = { id: nextId++ }; textures.set(t, null); return t; },
    deleteTexture() {}, activeTexture() {}, pixelStorei() {},
    bindTexture(_target, tex) { boundTexture = tex; },
    texImage2D(_t, _l, _if, _f, _ty, image) { uploads += 1; if (boundTexture) textures.set(boundTexture, image?.resolvedUrl ?? image?.src ?? null); },
    texParameteri() {},
    viewport() {}, clearColor() {}, clear() {},
    drawArrays() { draws.push(boundTexture ? textures.get(boundTexture) : null); },
    getExtension: () => null,
  };
}
window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
  return type === 'webgl' || type === 'experimental-webgl' ? (this.__gl ??= makeGL()) : null;
};
/* jsdom no hace layout: sin tamaño el visor no dibujaría. */
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 1280, configurable: true });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 720, configurable: true });

const sleep = (ms) => new Promise((r) => { window.setTimeout(r, ms); });
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const setInput = (el, value) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};

let failures = 0;
const expect = (cond, label) => {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures += 1; console.error(`  ✗ ${label}`); }
};

console.log(`· Bundle «${target}» servido en ${pageUrl}`);
await import(entryUrl);
await sleep(400);

setInput($('#onboarding-name'), 'Test 360');
await sleep(50);
click($$('.onboarding__avatars button')[1]);
await sleep(50);
click($('.onboarding__start'));
await sleep(400);

console.log('· Modo rescate');
click($('.mode-card--rescue'));
await sleep(3200);
expect(!!$('.rescue-game'), 'escena de rescate montada');
expect(!!$('.pano'), 'visor 360° montado');

const rescueLoad = imageLoads.at(-1);
expect(!!rescueLoad, 'el visor solicita la imagen 360°');
expect(rescueLoad?.status === 200, `la imagen 360° responde 200 (${rescueLoad?.status} · ${rescueLoad?.url})`);
expect(rescueLoad?.ok === true, `la imagen 360° llega completa (${rescueLoad?.bytes} bytes)`);
expect(uploads >= 1, 'la textura se sube a WebGL (texImage2D)');
await sleep(200);
expect(draws.length > 0, 'el bucle de render dibuja fotogramas');
expect(draws.at(-1) === rescueLoad?.url, 'cada fotograma dibuja la textura del panorama actual');
expect(!$('.pano__notice--error'), 'no se muestra el aviso de error del panorama');

console.log('· Modo exploración y viaje entre panoramas');
click($('.game-back'));
await sleep(300);
click($$('.mode-card')[1]);
await sleep(3200);
expect(!!$('.explore-game'), 'escena de exploración montada');
const exploreLoad = imageLoads.at(-1);
expect(exploreLoad?.ok === true, `panorama de exploración cargado (${exploreLoad?.status})`);
await sleep(200);
expect(draws.at(-1) === exploreLoad?.url, 'exploración dibuja su propio panorama');

click($$('.quick-actions button')[1]);
await sleep(200);
const nodes = $$('.travel-map__node');
click(nodes[nodes.length - 1]);
await sleep(600);
const travelled = imageLoads.at(-1);
expect(travelled?.ok === true, `viaje virtual: nuevo panorama cargado (${travelled?.status})`);
expect(draws.at(-1) === travelled?.url, 'tras viajar se dibuja el panorama de destino');

/* Volver a una zona ya visitada usa la textura cacheada: comprueba el re-enlace. */
click($$('.quick-actions button')[1]);
await sleep(200);
click($$('.travel-map__node')[0]);
await sleep(600);
const back = imageLoads.at(-1);
expect(draws.at(-1) === back?.url, 'al volver a una zona cacheada se re-enlaza su textura');

const notFound = requested.filter((r) => r.status === 404);
expect(notFound.length === 0, `sin peticiones 404 (${notFound.map((r) => r.path).join(', ') || 'ninguna'})`);

console.log(failures === 0 ? `\n✓ Panoramas 360° verificados (${target})` : `\n✗ ${failures} comprobaciones fallidas (${target})`);
server.close();
window.close();
process.exit(failures === 0 ? 0 : 1);
