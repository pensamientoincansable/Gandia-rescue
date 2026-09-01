/**
 * GameLoop — bucle principal desacoplado: arranca cuando la configuración
 * está cargada, ejecuta un paso fijo de simulación y delega el dibujado.
 *
 * Ejemplo de integración completo:
 *
 *   import { GameLoop } from './engine/GameLoop.js';
 *
 *   const loop = await GameLoop.create({
 *     terrain,                        // opcional: { getHeight(x, z, zoneId) }
 *     onUpdate: (dt, { player, input }) => { ... },
 *     onRender: (alpha, { player }) => renderer.render(scene, camera),
 *   });
 *   loop.start();
 */

import { InputManager } from './InputManager.js';
import { PlayerController } from './PlayerController.js';
import { CONFIG_FALLBACKS } from './defaults.js';

export class GameLoop {
  /** Crea el bucle con InputManager + PlayerController ya configurados. */
  static async create(options = {}) {
    const [input, player] = await Promise.all([
      InputManager.create({
        target: options.inputTarget ?? (typeof window !== 'undefined' ? window : null),
        fallback: CONFIG_FALLBACKS.keybindings,
      }),
      PlayerController.create({
        terrain: options.terrain ?? null,
        zoneId: options.zoneId ?? 'platja',
        statsFallback: CONFIG_FALLBACKS.playerStats,
        movesetFallback: CONFIG_FALLBACKS.moveset,
      }),
    ]);
    input.loadUserOverrides();
    return new GameLoop({ ...options, input, player });
  }

  constructor({ input, player, onUpdate = null, onRender = null, onAction = null, getTargets = null, fixedStep = 1 / 60 }) {
    this.input = input;
    this.player = player;
    this.onUpdate = onUpdate;
    this.onRender = onRender;
    this.onAction = onAction;      // (actionName) => void, para acciones "one-shot"
    this.getTargets = getTargets;  // () => entidades golpeables
    this.fixedStep = fixedStep;

    this.running = false;
    this._raf = 0;
    this._lastTime = 0;
    this._accumulator = 0;
    this._oneShotActions = ['INTERACT', 'HONK', 'TOGGLE_SIREN', 'TOGGLE_HEADLIGHTS', 'CYCLE_CAMERA', 'TOGGLE_FOOT_MODE', 'PHOTO_MODE'];
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = nowMs();
    this._raf = requestFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelFrame(this._raf);
  }

  dispose() {
    this.stop();
    this.input.dispose();
  }

  _tick = (timestamp = nowMs()) => {
    if (!this.running) return;
    this._raf = requestFrame(this._tick);

    const frameTime = Math.min(0.25, (timestamp - this._lastTime) / 1000);
    this._lastTime = timestamp;
    this._accumulator += frameTime;

    this.input.beginFrame();

    // Acciones puntuales (sirena, claxon, cámara, interacción…)
    for (const action of this._oneShotActions) {
      if (this.input.wasPressed(action)) this.onAction?.(action, this);
    }

    const snapshot = this.input.snapshot();
    const targets = this.getTargets?.() ?? [];

    let steps = 0;
    while (this._accumulator >= this.fixedStep && steps < 5) {
      this.player.update(this.fixedStep, snapshot, targets);
      this.onUpdate?.(this.fixedStep, { player: this.player, input: this.input, state: this.player.state });
      this._accumulator -= this.fixedStep;
      steps += 1;
    }

    this.input.endFrame();

    const alpha = this._accumulator / this.fixedStep;
    this.onRender?.(alpha, { player: this.player, state: this.player.state, input: this.input });
  };
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
function requestFrame(fn) {
  return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(() => fn(nowMs()), 16);
}
function cancelFrame(id) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}

export default GameLoop;
