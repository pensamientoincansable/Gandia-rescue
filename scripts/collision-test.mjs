/**
 * Verifica la corrección del bug de la furgoneta: antes atravesaba todos los
 * objetos del mundo y se inclinaba sin control sobre el relieve.
 *
 *   1. El vehículo choca con un árbol / roca / fachada y no lo atraviesa.
 *   2. Al chocar no se queda clavado: **desliza** sobre el obstáculo.
 *   3. El cabeceo y el alabeo se limitan y se suavizan (nunca vuelca).
 *   4. El guardián a pie tampoco atraviesa los objetos.
 *   5. El agua profunda (mar, dársena, cauce del Serpis) frena al vehículo.
 *
 * Ejecutar: node scripts/collision-test.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const root = resolve(import.meta.dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gandia.test/' });
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true });
define('window', dom.window);
define('document', dom.window.document);
define('navigator', dom.window.navigator);
define('localStorage', dom.window.localStorage);
define('KeyboardEvent', dom.window.KeyboardEvent);

const THREE = await import('three');
const { RescueVan } = await import('../src/three/RescueVan.js');
const { TerrainBuilder } = await import('../src/three/TerrainBuilder.js');

let fails = 0;
const expect = (cond, label) => { console.log(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) fails += 1; };

const stats = JSON.parse(await readFile(resolve(root, 'public/config/player_stats.json'), 'utf8'));
const scene = new THREE.Scene();
const terrain = new TerrainBuilder(scene);
const van = new RescueVan(scene, terrain, stats);

const input = { forward: false, backward: false, left: false, right: false, handbrake: false, jump: false };
const drive = (frames, zoneId, set = {}, t0 = 0) => {
  Object.assign(input, { forward: false, backward: false, left: false, right: false, handbrake: false }, set);
  for (let i = 0; i < frames; i += 1) van.update(1 / 60, input, zoneId, t0 + i / 60);
};

/* ------------------------------------------------------------------ 1. choque */
console.log('· La furgoneta ya no atraviesa los objetos');
const ZONE = 'montduver';
terrain.buildZone(ZONE);
terrain.obstacles.clear();
const spawn = stats.world.spawnPoints[ZONE];
van.setPosition(spawn.x, spawn.z, spawn.heading, ZONE);

// Árbol de 0,8 m de tronco plantado 20 m por delante de la salida.
const treeX = spawn.x;
const treeZ = spawn.z + 20;
terrain.registerObstacles([{ x: treeX, z: treeZ, radius: 0.8, height: 7, type: 'vegetation' }]);

drive(240, ZONE, { forward: true });
const distanceToTree = Math.hypot(van.position.x - treeX, van.position.z - treeZ);
const clearance = distanceToTree - (van.collisionRadius + 0.8);
expect(clearance > -0.02, `se detiene antes del tronco (holgura ${clearance.toFixed(2)} m)`);
expect(distanceToTree < 12, `no ha rebasado el árbol (${distanceToTree.toFixed(2)} m de separación)`);

/* ------------------------------------------------------------- 2. deslizamiento */
console.log('· Al rozar un obstáculo desliza en vez de quedarse clavado');
terrain.obstacles.clear();
// Muro de bolardos en diagonal: el vehículo debe avanzar pegado a él.
const wall = [];
for (let i = -8; i <= 8; i += 1) {
  wall.push({ x: spawn.x + 6 + i * 0.9, z: spawn.z + 22 + i * 1.6, radius: 0.5, height: 1, type: 'prop' });
}
terrain.registerObstacles(wall);
van.setPosition(spawn.x, spawn.z, spawn.heading, ZONE);
const slideFrom = { x: van.position.x, z: van.position.z };
drive(300, ZONE, { forward: true });
const slideDistance = Math.hypot(van.position.x - slideFrom.x, van.position.z - slideFrom.z);
expect(slideDistance > 8, `avanza pegado al muro en vez de frenar en seco (${slideDistance.toFixed(1)} m)`);

/* ------------------------------------------------------------------ 3. inclinación */
console.log('· Cabeceo y alabeo limitados y suavizados');
terrain.obstacles.clear();
let maxPitch = 0;
let maxRoll = 0;
for (const [startX, startZ, heading] of [[-70, -60, 0.4], [-30, -30, 1.2], [20, -10, 2.6], [40, 30, -0.8]]) {
  van.setPosition(startX, startZ, heading, ZONE);
  drive(420, ZONE, { forward: true, left: true }, 0);
  maxPitch = Math.max(maxPitch, Math.abs(van.smoothPitch));
  maxRoll = Math.max(maxRoll, Math.abs(van.smoothRoll));
}
expect(maxPitch <= stats.vehicle.maxPitch + 1e-6, `cabeceo dentro del límite (${maxPitch.toFixed(3)} ≤ ${stats.vehicle.maxPitch})`);
expect(maxRoll <= stats.vehicle.maxRoll + 1e-6, `alabeo dentro del límite (${maxRoll.toFixed(3)} ≤ ${stats.vehicle.maxRoll})`);

/* El vehículo se apoya en la pendiente: el costado que pisa más alto se
 * levanta. El bug original muestreaba el lado contrario y la furgoneta se
 * tumbaba hacia fuera de la ladera. */
const lateralProbe = (x, z, heading) => {
  van.setPosition(x, z, heading, ZONE);
  drive(90, ZONE, {});
  // Derecha física del vehículo = adelante × arriba.
  const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0));
  const high = terrain.getHeight(x + right.x * 2, z + right.z * 2, ZONE);
  const low = terrain.getHeight(x - right.x * 2, z - right.z * 2, ZONE);
  const vanUp = new THREE.Vector3(0, 1, 0).applyQuaternion(van.group.quaternion);
  // > 0 ⇒ el techo se inclina hacia el costado derecho.
  const roofTilt = vanUp.dot(right);
  return { groundDelta: high - low, roofTilt };
};

for (const [probeX, probeZ, probeHeading] of [[30, 20, 0], [-26, 34, Math.PI / 2], [18, -44, Math.PI]]) {
  const probe = lateralProbe(probeX, probeZ, probeHeading);
  const leansToLowerSide = Math.sign(probe.roofTilt) === -Math.sign(probe.groundDelta);
  expect(leansToLowerSide,
    `en (${probeX}, ${probeZ}) el techo cae hacia el costado más bajo (Δsuelo ${probe.groundDelta.toFixed(2)} m, inclinación ${probe.roofTilt.toFixed(3)})`);
}

// Sin obstáculos ni relieve extremo la furgoneta va prácticamente nivelada.
const FLAT = 'platja';
terrain.buildZone(FLAT);
van.setPosition(stats.world.spawnPoints[FLAT].x, stats.world.spawnPoints[FLAT].z, 0, FLAT);
drive(240, FLAT, { forward: true });
expect(Math.abs(van.smoothPitch) < 0.12, `plana en el paseo marítimo (pitch ${van.smoothPitch.toFixed(3)})`);
expect(Math.abs(van.smoothRoll) < 0.12, `sin volcar en llano (roll ${van.smoothRoll.toFixed(3)})`);

/* ------------------------------------------------------------------ 4. a pie */
console.log('· El guardián tampoco atraviesa los objetos');
terrain.buildZone(ZONE);
terrain.obstacles.clear();
van.setPosition(0, -40, 0, ZONE);
van.dismount();
van.rangerPosition.set(0, terrain.getHeight(0, -40, ZONE), -40);
terrain.registerObstacles([{ x: 0, z: -30, radius: 0.6, height: 6, type: 'vegetation' }]);
for (let i = 0; i < 400; i += 1) {
  van.update(1 / 60, { forward: true, backward: false, left: false, right: false, handbrake: false, jump: false }, ZONE, i / 60);
}
const rangerDistance = Math.hypot(van.rangerPosition.x - 0, van.rangerPosition.z + 30);
expect(rangerDistance > 0.55, `el guardián se detiene ante el tronco (${rangerDistance.toFixed(2)} m)`);
van.mount();

/* ------------------------------------------------------------------ 5. agua */
console.log('· El vehículo no se mete en el agua');
const RIVER = 'riu';
terrain.buildZone(RIVER);
terrain.obstacles.clear();
van.setPosition(-35, -60, Math.PI / 2, RIVER); // rumbo hacia el cauce
drive(420, RIVER, { forward: true });
expect(terrain.isFlooded(van.position.x, van.position.z, RIVER) === false,
  `se queda fuera del cauce del Serpis (x=${van.position.x.toFixed(1)})`);

const SEA = 'platja';
terrain.buildZone(SEA);
terrain.obstacles.clear();
van.setPosition(20, 0, Math.PI / 2, SEA); // rumbo al mar
drive(600, SEA, { forward: true });
expect(terrain.isFlooded(van.position.x, van.position.z, SEA) === false,
  `no entra en el mar (x=${van.position.x.toFixed(1)})`);

console.log(fails === 0
  ? '\n✓ Colisiones e inclinación verificadas'
  : `\n✗ ${fails} comprobaciones de colisión fallidas`);
process.exit(fails ? 1 : 0);
