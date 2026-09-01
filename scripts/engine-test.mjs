/**
 * Prueba del núcleo desacoplado: InputManager + PlayerController leyendo
 * la configuración JSON. Ejecutar con: node scripts/engine-test.mjs
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

// fetch() simulado sobre el directorio public/config
define('fetch', async (url) => {
  const name = new URL(url).pathname.split('/').pop();
  const body = await readFile(resolve(root, 'public/config', name), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
});

const { InputManager } = await import('../src/engine/InputManager.js');
const { PlayerController } = await import('../src/engine/PlayerController.js');

let fails = 0;
const expect = (cond, label) => { console.log(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) fails += 1; };

console.log('· InputManager');
const input = await InputManager.create({ target: dom.window });
expect(input.ready, 'keybindings.json cargado por fetch()');
expect(input.describeBindings().length > 10, 'acciones abstractas registradas');

const press = (code, down = true) => dom.window.dispatchEvent(new dom.window.KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
input.beginFrame();
press('KeyW');
expect(input.isDown('MOVE_FORWARD'), 'KeyW → MOVE_FORWARD');
expect(input.wasPressed('MOVE_FORWARD'), 'flanco de pulsación detectado');
press('ArrowUp'); // binding alternativo
expect(input.axis('MOVE_BACKWARD', 'MOVE_FORWARD') === 1, 'eje compuesto = 1');
input.endFrame();
expect(!input.wasPressed('MOVE_FORWARD'), 'el flanco se consume al final del frame');
press('KeyW', false);

input.rebind('MOVE_FORWARD', { keyboard: ['KeyZ'] }, { persist: false });
press('KeyZ');
expect(input.isDown('MOVE_FORWARD'), 'rebinding en caliente funciona');
press('KeyZ', false);
input.reset();

console.log('· PlayerController — física');
const terrain = { getHeight: () => 0 };
const player = await PlayerController.create({ terrain, zoneId: 'platja' });
expect(player.stats.vehicle.maxSpeed === 24, 'player_stats.json cargado');
expect(player.state.health === player.stats.vitals.startHealth, 'vida inicial desde JSON');

const fakeInput = (down = []) => ({
  isDown: (a) => down.includes(a),
  wasPressed: (a) => down.includes(a),
  axis: (n, p) => (down.includes(p) ? 1 : 0) - (down.includes(n) ? 1 : 0),
});

for (let i = 0; i < 120; i += 1) player.update(1 / 60, fakeInput(['MOVE_FORWARD']));
expect(player.state.speed > 10, `acelera (${player.state.speed.toFixed(1)} m/s)`);
expect(player.state.speed <= player.stats.vehicle.maxSpeed + 1e-6, 'respeta maxSpeed del JSON');
for (let i = 0; i < 600; i += 1) player.update(1 / 60, fakeInput([]));
expect(player.state.speed === 0, 'la fricción detiene el vehículo');

player.toggleMode();
expect(player.state.mode === 'foot', 'cambio a modo a pie');
player.update(1 / 60, fakeInput(['JUMP']));
expect(!player.state.grounded, 'salto usando ranger.jumpForce');

console.log('· PlayerController — combate y combos');
player.state.mode = 'foot';
player.state.stamina = player.state.maxStamina;
const target = { id: 'jabali', position: { x: 0, y: 1.1, z: 1.4 }, size: 'medium', state: 'idle', radius: 0.8, hits: [], applyHit(r) { this.hits.push(r); } };
player.setPosition(0, 0, 0);

const step = (actions) => player.update(1 / 60, fakeInput(actions), [target]);
step(['ATTACK_LIGHT']);
expect(player.state.currentMove?.id === 'NET_JAB', 'ATTACK_LIGHT inicia NET_JAB (moveset.json)');
for (let i = 0; i < 8; i += 1) step([]);
expect(target.hits.length === 1, 'hitframes del JSON producen un impacto');
expect(target.hits[0].damage === 8, `daño base del JSON = ${target.hits[0].damage}`);
expect(target.hits[0].knockback.force > 0, 'knockback aplicado desde el JSON');

const dmgSmall = player.computeDamage('CAGE_SLAM', { size: 'small', state: 'stunned' });
expect(dmgSmall.damage === 22 * 1.4 * 1.6, `tabla de daño aplicada (${dmgSmall.damage})`);

// Combo completo: NET_JAB → NET_SWEEP → CAGE_SLAM
player.state.comboChain = ['NET_JAB', 'NET_SWEEP'];
const finisher = player.computeDamage('CAGE_SLAM', { size: 'medium', state: 'idle' });
expect(finisher.comboId === 'RESCUE_BASIC', 'combo RESCUE_BASIC reconocido');
expect(finisher.damage === 28, `bonus de finisher aplicado (${finisher.damage})`);

console.log(fails ? `\n✗ ${fails} comprobaciones fallidas` : '\n✓ Todo correcto');
process.exit(fails ? 1 : 0);
