/**
 * Verifica el personaje jugable y su cadena de respaldo sin romper el juego:
 *  1. el guardián se monta desde el pack `media/Fantasy Character`
 *     (CharacterSystem + config/characters.json) y mide 1.85 m con los pies
 *     en el suelo;
 *  2. si el pack no está disponible, `models.json` declara la cadena de
 *     respaldo (copia local opcional → ranger procedural) y el monigote final;
 *  3. `ModelFitter` normaliza cualquier asset a 1.85 m, pies en el suelo y
 *     centrado (los modelos externos vienen en cualquier unidad/orientación);
 *  4. el guardián a pie integra el modelo (altura real, animación procedural).
 *
 * Ejecutar: node scripts/player-model-test.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const root = resolve(import.meta.dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gandia.test/' });
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true });
define('window', dom.window);
define('document', dom.window.document);
define('navigator', dom.window.navigator);
define('localStorage', dom.window.localStorage);
// El FileLoader de three emite ProgressEvent al descargar: sin él, Node aborta.
define('ProgressEvent', dom.window.ProgressEvent);
// Se conserva el fetch nativo: la sección final lo necesita para hablar con el
// servidor HTTP local (el stub de abajo sólo sirve los JSON de configuración).
const nativeFetch = globalThis.fetch;
let serveAssets = true;
define('fetch', async (input) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
  if (!serveAssets) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  try {
    const body = readFileSync(resolve(root, 'public', pathname));
    const text = body.toString('utf8');
    if (pathname.endsWith('.json')) return { ok: true, status: 200, json: async () => JSON.parse(text) };
    return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  }
});

const THREE = await import('three');
const { createFittedHolder, measureObject, normalizeFit } = await import('../src/three/ModelFitter.js');
const {
  DEFAULT_MODELS, PLAYER_MODEL_LOCAL_PATH,
  clearModelCache, loadModel, loadModelCandidates, setModelResolverForTests,
} = await import('../src/three/ModelLoader.js');
const { resetCharacterSystem } = await import('../src/three/CharacterSystem.js');
const { AnimatedEntity } = await import('../src/three/AnimatedEntity.js');
const { RescueVan } = await import('../src/three/RescueVan.js');
const { TerrainBuilder } = await import('../src/three/TerrainBuilder.js');

let failures = 0;
const expect = (condition, label) => {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) failures += 1;
};
const near = (value, target, tolerance = 0.01) => Math.abs(value - target) <= tolerance;

/** Escena sintética que imita un asset externo: enorme, descentrada y sin clips. */
function fakeExternalScene({ tall = 100, wide = 40, upAxis = 'y', offset = 25 } = {}) {
  const mesh = new THREE.Mesh(
    upAxis === 'y'
      ? new THREE.BoxGeometry(wide, tall, wide)
      : new THREE.BoxGeometry(wide, wide, tall), // asset Z-up
    new THREE.MeshStandardMaterial({ color: 0x8899aa }),
  );
  mesh.position.set(offset, upAxis === 'y' ? tall / 2 + 7 : wide / 2 + 7, -offset);
  const scene = new THREE.Group();
  scene.add(mesh);
  return scene;
}
/** GLTF simulado (sin animaciones, como los generados con IA). */
const fakeGltf = (options) => ({ scene: fakeExternalScene(options), animations: [] });

console.log('· Manifiesto del personaje jugable (respaldo del pack)');
const manifest = JSON.parse(readFileSync(resolve(root, 'public/config/models.json'), 'utf8'));
const ranger = manifest.ranger;
const candidates = ranger.paths ?? [];
expect(Array.isArray(candidates) && candidates.length >= 2, 'declara una cadena de candidatas (copia local → respaldo)');
expect(candidates[0] === PLAYER_MODEL_LOCAL_PATH, `la primera candidata es la copia local (${PLAYER_MODEL_LOCAL_PATH})`);
expect(!candidates.some((path) => /^https?:\/\//.test(path)), 'sin URLs remotas: el modelo remoto (SupaVoxel) no se usa');
expect(candidates.includes('models/ranger.glb') && existsSync(resolve(root, 'public/models/ranger.glb')),
  'conserva el ranger procedural como último respaldo y existe en el repositorio');
expect(candidates.every((path) => existsSync(resolve(root, 'public', path)) || path === PLAYER_MODEL_LOCAL_PATH),
  'toda candidata local o existe o es la copia descargable');
const fit = ranger.fit ?? {};
expect(fit.height > 1.5 && fit.height < 2.2, `altura objetivo humana (${fit.height} m)`);
expect(Array.isArray(DEFAULT_MODELS.ranger.paths) && DEFAULT_MODELS.ranger.paths.includes('models/ranger.glb'),
  'los valores por defecto replican la cadena (sin models.json)');
for (const copy of ['public/config/models.json', 'static/config/models.json']) {
  const json = JSON.parse(readFileSync(resolve(root, copy), 'utf8'));
  expect(json.ranger?.paths?.includes('models/ranger.glb'), `${copy}: copia publicada al día`);
}
if (existsSync(resolve(root, 'public', PLAYER_MODEL_LOCAL_PATH))) {
  const glb = readFileSync(resolve(root, 'public', PLAYER_MODEL_LOCAL_PATH));
  expect(glb.readUInt32LE(0) === 0x46546c67, 'la copia local descargada es un .glb válido');
  console.log(`  ℹ copia local presente: ${statSync(resolve(root, 'public', PLAYER_MODEL_LOCAL_PATH)).size.toLocaleString('es-ES')} B`);
} else {
  console.log('  ℹ copia local ausente: el guardián usa el pack de personajes o el ranger procedural');
}

console.log('· Ajuste automático de escala y orientación (ModelFitter)');
{
  const { pivot, scale, size } = createFittedHolder(fakeExternalScene({ tall: 100 }), { height: 1.85 });
  expect(near(scale, 0.0185, 0.0005), `un asset de 100 unidades se reduce a escala humana (×${scale.toFixed(5)})`);
  const box = new THREE.Box3().setFromObject(pivot, true);
  expect(near(size.y, 1.85, 0.01) && near(box.max.y - box.min.y, 1.85, 0.01), 'mide 1.85 m de alto tras el ajuste');
  expect(near(box.min.y, 0, 0.01), 'los pies quedan apoyados en y = 0');
  const center = box.getCenter(new THREE.Vector3());
  expect(near(center.x, 0, 0.01) && near(center.z, 0, 0.01), 'queda centrado en XZ sobre el origen');
  let shadows = 0;
  pivot.traverse((child) => { if (child.isMesh && child.castShadow) shadows += 1; });
  expect(shadows > 0, 'sus mallas proyectan sombra');
}
{
  // Asset Z-up: sin corrección mediría 1 m; con rotation.x = -90 mide 1.85 m.
  const zUp = fakeExternalScene({ tall: 100, wide: 40, upAxis: 'z' });
  expect(near(createFittedHolder(zUp, { height: 1.85 }).size.y, 1.85, 0.6),
    'sin corrección de ejes el ajuste no inventa una altura (queda en ~1 m)');
  const corrected = createFittedHolder(fakeExternalScene({ tall: 100, wide: 40, upAxis: 'z' }), {
    height: 1.85, rotation: { x: -90 },
  });
  expect(near(corrected.size.y, 1.85, 0.01), 'rotation.x = -90 endereza un asset Z-up a 1.85 m');
}
{
  const kept = createFittedHolder(fakeExternalScene({ tall: 100 }), { height: 1.85, center: false });
  const box = new THREE.Box3().setFromObject(kept.pivot, true);
  expect(box.getCenter(new THREE.Vector3()).x !== 0, 'center:false respeta el origen original del asset');
  const untouched = createFittedHolder(fakeExternalScene({ tall: 2 }), normalizeFit({ height: null }));
  expect(near(untouched.size.y, 2, 0.01), 'sin altura objetivo no se reescala (respeta el asset)');
}

console.log('· Cadena de candidatas del modelo');
setModelResolverForTests((path) => (path === PLAYER_MODEL_LOCAL_PATH ? fakeGltf({ tall: 180 }) : null));
{
  const entity = new AnimatedEntity({
    buildFallback: () => new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3)),
    motion: 'idle',
    label: 'test',
  });
  const result = await entity.setModelSources(
    [PLAYER_MODEL_LOCAL_PATH, 'models/ranger.glb'],
    { idle: 'Idle' },
    { fit: { height: 1.85 } },
  );
  expect(result.loaded && result.path === PLAYER_MODEL_LOCAL_PATH, 'si la copia local carga, es la elegida');
  expect(entity.fallback === null, 'retira el monigote al llegar el modelo');
  const box = new THREE.Box3().setFromObject(entity.visual, true);
  expect(near(box.max.y - box.min.y, 1.85, 0.02), 'el modelo externo se normaliza a 1.85 m');
}
{
  setModelResolverForTests(() => null);
  const mannequin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3));
  const entity = new AnimatedEntity({ buildFallback: () => mannequin, motion: 'idle' });
  const result = await entity.setModelSources([PLAYER_MODEL_LOCAL_PATH], {}, { fit: { height: 1.85 } });
  expect(!result.loaded && entity.fallback === mannequin, 'si ninguna candidata carga, el monigote sigue en escena');
}
setModelResolverForTests(null);

console.log('· Integración con el guardián a pie');
{
  const scene = new THREE.Scene();
  const terrain = new TerrainBuilder(scene);
  const stats = JSON.parse(readFileSync(resolve(root, 'public/config/player_stats.json'), 'utf8'));
  const van = new RescueVan(scene, terrain, stats);
  const result = await van._applyRangerModel();

  expect(result.loaded && String(result.path).startsWith('character:'),
    `RescueVan monta el guardián del pack de personajes (${result.path})`);
  expect(van.rangerModelSource === result.path, 'deja constancia del asset activo');
  expect(van.rangerAvatar.fallback === null && van.rangerAvatar.hasModel, 'el avatar sustituye al monigote');

  van.rangerAvatar.root.position.set(0, 0, 0);
  van.rangerAvatar.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(van.rangerAvatar.root, true);
  expect(near(box.max.y - box.min.y, 1.85, 0.02), `el personaje mide ${(box.max.y - box.min.y).toFixed(2)} m en el mundo`);
  expect(near(box.min.y, 0, 0.02), 'sus pies coinciden con el punto de apoyo del motor');
  expect(!result.animated && van.rangerAvatar.procedural, 'modelo sin clips → animación procedural activada');

  const spawn = stats.world.spawnPoints.platja;
  van.setPosition(spawn.x, spawn.z, spawn.heading, 'platja');
  van.dismount();
  expect(van.rangerGroup.visible, 'al bajar de la furgoneta se muestra el personaje');
  expect(near(van.rangerAvatar.root.position.x, van.rangerPosition.x, 1e-6)
    && near(van.rangerAvatar.root.position.z, van.rangerPosition.z, 1e-6), 'el modelo sigue la posición del guardián');

  const visual = van.rangerAvatar.visual;
  van.rangerAvatar.setMotion('walk');
  for (let frame = 0; frame < 30; frame += 1) van.rangerAvatar.update(1 / 60, frame / 60);
  expect(visual.position.y !== 0 || visual.rotation.x !== 0, 'camina con balanceo aunque el pack no traiga animaciones');
  const walkedLean = visual.rotation.x;
  van.rangerAvatar.setMotion('idle');
  for (let frame = 0; frame < 90; frame += 1) van.rangerAvatar.update(1 / 60, frame / 60);
  expect(Math.abs(visual.rotation.x) < Math.abs(walkedLean) + 1e-6, 'en reposo se endereza de nuevo');
}

console.log('· Respaldo si el pack de personajes no está disponible');
{
  serveAssets = false;
  resetCharacterSystem();
  setModelResolverForTests((path) => (path === PLAYER_MODEL_LOCAL_PATH ? fakeGltf({ tall: 180 }) : null));
  const scene = new THREE.Scene();
  const terrain = new TerrainBuilder(scene);
  const stats = JSON.parse(readFileSync(resolve(root, 'public/config/player_stats.json'), 'utf8'));
  const van = new RescueVan(scene, terrain, stats);
  const result = await van._applyRangerModel();
  expect(result.loaded && result.path === PLAYER_MODEL_LOCAL_PATH, `sin pack usa la copia local del manifiesto (${result.path})`);
  const box = new THREE.Box3().setFromObject(van.rangerAvatar.root, true);
  expect(near(box.max.y - box.min.y, 1.85, 0.02), 'el respaldo también se normaliza a 1.85 m');
  serveAssets = true;
  resetCharacterSystem();
}

setModelResolverForTests(null);

console.log('· Carga real por GLTFLoader (servidor HTTP local)');
{
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    try {
      const body = await readFile(resolve(root, 'public', rel));
      res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('no encontrado');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  const originalDocument = globalThis.document;
  define('document', { baseURI: `http://127.0.0.1:${port}/` });
  define('fetch', nativeFetch);
  clearModelCache();
  setModelResolverForTests(null);
  try {
    const missing = await loadModel(PLAYER_MODEL_LOCAL_PATH);
    expect(missing === null, 'la copia local ausente responde 404 sin romper la carga');
    const chain = await loadModelCandidates([PLAYER_MODEL_LOCAL_PATH, 'models/ranger.glb']);
    expect(chain.path === 'models/ranger.glb' && !!chain.gltf, 'la cadena salta el 404 y carga el .glb real siguiente');
    expect((chain.gltf.animations?.length ?? 0) >= 4, `el .glb real llega con sus clips (${chain.gltf.animations?.length})`);
    const fitted = createFittedHolder(chain.gltf.scene, { height: 1.85 });
    const box = new THREE.Box3().setFromObject(fitted.pivot, true);
    expect(near(box.max.y - box.min.y, 1.85, 0.02), 'el ajuste funciona sobre un asset real cargado por GLTFLoader');
    expect(fitted.scale > 0.6 && fitted.scale < 1.6, `el ranger del repo ya está en metros (×${fitted.scale.toFixed(3)})`);
  } finally {
    define('document', originalDocument);
    clearModelCache();
    server.close();
  }
}

console.log(failures === 0 ? '\n✓ Modelo del personaje jugable validado' : `\n✗ ${failures} comprobaciones fallidas`);
process.exit(failures === 0 ? 0 : 1);
