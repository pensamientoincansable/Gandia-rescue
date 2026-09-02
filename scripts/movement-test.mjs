/**
 * Verifica el movimiento real en el escenario usando las clases del juego:
 *  1. La furgoneta se desplaza y gira con las teclas configuradas.
 *  2. El guardián puede bajarse, caminar y esprintar por el terreno.
 *  3. Se puede volver a subir al vehículo y conducirlo de nuevo.
 * Ejecutar con: node scripts/movement-test.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const root = resolve(import.meta.dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gandia.test/' });
const define = (n, v) => Object.defineProperty(globalThis, n, { value: v, configurable: true });
define('window', dom.window);
define('document', dom.window.document);
define('navigator', dom.window.navigator);
define('localStorage', dom.window.localStorage);
define('KeyboardEvent', dom.window.KeyboardEvent);
define('fetch', async (url) => {
  const name = new URL(url).pathname.split('/').pop();
  const body = await readFile(resolve(root, 'public/config', name), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
});

const THREE = await import('three');
const { RescueVan } = await import('../src/three/RescueVan.js');
const { TerrainBuilder } = await import('../src/three/TerrainBuilder.js');
const { InputManager } = await import('../src/engine/InputManager.js');

let fails = 0;
const expect = (cond, label) => { console.log(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) fails += 1; };

const scene = new THREE.Scene();
const terrain = new TerrainBuilder(scene);
const stats = JSON.parse(await readFile(resolve(root, 'public/config/player_stats.json'), 'utf8'));
const van = new RescueVan(scene, terrain, stats);

const ZONE = 'platja';
const spawn = stats.world.spawnPoints[ZONE];
van.setPosition(spawn.x, spawn.z, spawn.heading, ZONE);

// Estado de entrada tal y como lo produce el InputManager en GandiaWorld3D
const input = { forward: false, backward: false, left: false, right: false, handbrake: false };
const drive = (frames, set = {}) => {
  Object.assign(input, { forward: false, backward: false, left: false, right: false, handbrake: false }, set);
  for (let i = 0; i < frames; i += 1) van.update(1 / 60, input, ZONE, i / 60);
};
const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

console.log('· Punto de aparición');
expect(van.position.x === spawn.x && van.position.z === spawn.z, `la furgoneta aparece en (${spawn.x}, ${spawn.z}) según player_stats.json`);
const groundY = terrain.getHeight(spawn.x, spawn.z, ZONE);
expect(Math.abs(van.position.y - groundY) < 0.01, 'apoyada sobre la altura del terreno');

console.log('· Conducción de la furgoneta');
let from = van.position.clone();
drive(120, { forward: true });
expect(dist2D(van.position, from) > 5, `avanza al acelerar (${dist2D(van.position, from).toFixed(1)} m)`);
expect(van.speed > 0, `alcanza velocidad positiva (${van.speed.toFixed(1)} m/s)`);
expect(van.speed <= stats.vehicle.maxSpeed + 1e-6, 'no supera maxSpeed del JSON');

const headingBefore = van.heading;
drive(60, { forward: true, left: true });
expect(Math.abs(van.heading - headingBefore) > 0.05, 'gira a la izquierda');
const headingLeft = van.heading;
drive(60, { forward: true, right: true });
expect(van.heading < headingLeft, 'gira a la derecha en sentido opuesto');

drive(120, { handbrake: true });
expect(van.speed === 0, 'el freno de mano detiene la furgoneta');

from = van.position.clone();
drive(90, { backward: true });
expect(van.speed < 0, `marcha atrás (${van.speed.toFixed(1)} m/s)`);
expect(dist2D(van.position, from) > 1, 'retrocede en el espacio');
drive(120, { handbrake: true });

console.log('· Bajarse del vehículo y caminar');
const vanPos = van.position.clone();
const vanHeading = van.heading;
const onFoot = van.toggleFootMode();
expect(onFoot === true && van.isFootMode, 'F/botón: el guardián se baja de la furgoneta');
const expectedDoor = new THREE.Vector3(
  vanPos.x + stats.ranger.doorSide * stats.ranger.dismountDistance * Math.cos(vanHeading),
  0,
  vanPos.z - stats.ranger.doorSide * stats.ranger.dismountDistance * Math.sin(vanHeading),
);
expect(dist2D(van.rangerPosition, expectedDoor) < 0.01, 'sale exactamente junto a la puerta en la posición actual de la furgoneta');
expect(dist2D(van.position, vanPos) < 0.001, 'bajarse no mueve la furgoneta ni la devuelve al spawn');
expect(dist2D(van.rangerPosition, spawn) > 5, 'el guardián conserva la zona alcanzada, no reaparece en el spawn');
expect(van.getActivePosition() === van.rangerPosition, 'la posición activa pasa a ser la del guardián');

let footFrom = van.rangerPosition.clone();
drive(60, { forward: true });
const walked = dist2D(van.rangerPosition, footFrom);
expect(walked > 3, `camina por el escenario (${walked.toFixed(1)} m en 1 s)`);
expect(Math.abs(walked - stats.ranger.walkSpeed) < 1.0, `a la velocidad de player_stats.json (~${stats.ranger.walkSpeed} m/s)`);
expect(van.speed === 0, 'la furgoneta permanece parada mientras vamos a pie');

footFrom = van.rangerPosition.clone();
drive(60, { forward: true, handbrake: true });
const sprinted = dist2D(van.rangerPosition, footFrom);
expect(sprinted > walked * 1.5, `esprinta más rápido (${sprinted.toFixed(1)} m vs ${walked.toFixed(1)} m)`);

const hBefore = van.rangerHeading;
drive(30, { left: true });
expect(van.rangerHeading !== hBefore, 'el guardián gira sobre sí mismo');

footFrom = van.rangerPosition.clone();
drive(60, { backward: true });
expect(dist2D(van.rangerPosition, footFrom) > 2, 'camina hacia atrás');

const rY = van.rangerPosition.y;
expect(Math.abs(rY - terrain.getHeight(van.rangerPosition.x, van.rangerPosition.z, ZONE)) < 0.01, 'sigue el relieve del terreno');

// Límites del mundo definidos en el JSON
drive(60 * 60, { forward: true, handbrake: true });
const { boundsMin, boundsMax } = stats.world;
expect(van.rangerPosition.x >= boundsMin && van.rangerPosition.x <= boundsMax
    && van.rangerPosition.z >= boundsMin && van.rangerPosition.z <= boundsMax, 'no se sale de los límites del mundo');

console.log('· Volver a subir y conducir');
const backIn = van.toggleFootMode();
expect(backIn === false && !van.isFootMode, 'el guardián vuelve a subir a la furgoneta');
expect(van.getActivePosition() === van.position, 'la posición activa vuelve a ser la del vehículo');

from = van.position.clone();
drive(120, { forward: true });
expect(dist2D(van.position, from) > 5, `la furgoneta vuelve a responder (${dist2D(van.position, from).toFixed(1)} m)`);

console.log('· Equipamiento del vehículo');
expect(van.toggleSiren() ?? van.sirenActive, 'la sirena se activa');
van.updateSirens(1.0);
const lit = van.sirenLights.some((s) => s.light.intensity > 0);
expect(lit, 'las balizas de emergencia se iluminan');
van.toggleHeadlights();
expect(van.headlights.every((h) => h.visible === van.headlightsActive), 'los faros responden');

console.log('· Cámaras en todos los modos');
const camera = new THREE.PerspectiveCamera(stats.camera.fov, 1.6, stats.camera.near, stats.camera.far);
for (const mode of stats.camera.modes) {
  van.cameraMode = mode;
  van.isFootMode = false;
  van.updateCamera(camera, 1 / 60);
  expect(Number.isFinite(camera.position.x) && Number.isFinite(camera.position.y), `cámara '${mode}' produce una posición válida`);
}
van.isFootMode = true;
van.updateCamera(camera, 1 / 60);
expect(Number.isFinite(camera.position.y), "cámara 'a pie' produce una posición válida");

console.log('· Teclas configuradas → acciones de movimiento');
const im = await InputManager.create({ target: dom.window });
const press = (code, down = true) => dom.window.dispatchEvent(new dom.window.KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
const checkKey = (code, action) => {
  press(code); const ok = im.isDown(action); press(code, false);
  expect(ok, `${code} → ${action}`);
};
checkKey('KeyW', 'MOVE_FORWARD');
checkKey('KeyS', 'MOVE_BACKWARD');
checkKey('KeyA', 'STEER_LEFT');
checkKey('KeyD', 'STEER_RIGHT');
checkKey('ArrowUp', 'MOVE_FORWARD');
checkKey('Space', 'HANDBRAKE');
im.beginFrame(); press('KeyF');
expect(im.wasPressed('TOGGLE_FOOT_MODE'), 'KeyF → TOGGLE_FOOT_MODE (entrar/salir del vehículo)');
press('KeyF', false);
press('KeyV');
expect(im.wasPressed('CYCLE_CAMERA'), 'KeyV → CYCLE_CAMERA');
press('KeyV', false);
press('KeyE');
expect(im.wasPressed('INTERACT'), 'KeyE → INTERACT');
im.endFrame();

console.log(fails ? `\n✗ ${fails} comprobaciones fallidas` : '\n✓ Movimiento y control del vehículo verificados');
process.exit(fails ? 1 : 0);
