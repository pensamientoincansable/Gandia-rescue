/**
 * InputManager — traduce entradas físicas (teclado, ratón, gamepad) en
 * ACCIONES ABSTRACTAS del juego ("MOVE_FORWARD", "JUMP", "ATTACK_LIGHT"…).
 *
 * · No contiene ninguna tecla escrita a fuego: todo el mapeo procede de
 *   `config/keybindings.json`, cargado con fetch() a través de ConfigLoader.
 * · Expone un estado consultable por frame (isDown / wasPressed / axis) y
 *   un búfer de entradas para el sistema de combos.
 * · Soporta rebinding en caliente y entradas virtuales (HUD táctil).
 *
 * Uso:
 *   const input = await InputManager.create({ target: window });
 *   // en el bucle:
 *   input.beginFrame();
 *   if (input.wasPressed('INTERACT')) { ... }
 *   input.endFrame();
 */

import { loadConfig } from './ConfigLoader.js';

const MOUSE_BUTTON_NAMES = ['left', 'middle', 'right', 'back', 'forward'];

export class InputManager {
  /**
   * Fábrica asíncrona: carga la configuración y engancha los listeners.
   * @param {{ target?: EventTarget, configFile?: string, fallback?: object, autoAttach?: boolean }} options
   */
  static async create(options = {}) {
    const manager = new InputManager(options);
    await manager.load();
    if (options.autoAttach !== false) manager.attach();
    return manager;
  }

  constructor({ target = (typeof window !== 'undefined' ? window : null), configFile = 'keybindings.json', fallback = null } = {}) {
    this.target = target;
    this.configFile = configFile;
    this.fallback = fallback;
    this.config = null;
    this.ready = false;

    /** @type {Map<string, Set<string>>} códigos de tecla → acciones */
    this.keyToActions = new Map();
    /** @type {Map<string, Set<string>>} botón de ratón → acciones */
    this.mouseToActions = new Map();
    /** @type {Array<{action:string, button:number}>} */
    this.gamepadButtons = [];
    /** @type {Array<{action:string, index:number, direction:number}>} */
    this.gamepadAxes = [];

    this.active = new Set();      // acciones mantenidas
    this.pressed = new Set();     // acciones activadas este frame
    this.released = new Set();    // acciones soltadas este frame
    this.virtual = new Set();     // acciones forzadas desde el HUD táctil
    this.buffer = [];             // { action, time } para combos

    this.pointerDelta = { x: 0, y: 0 };
    this.wheelDelta = 0;

    this._listeners = [];
    this._bufferWindowMs = 250;
  }

  /* ------------------------------------------------------------ Carga */

  async load() {
    this.config = await loadConfig(this.configFile, this.fallback);
    this.rebuildMaps();
    this.ready = true;
    return this.config;
  }

  /** Reconstruye los índices de búsqueda entrada → acción. */
  rebuildMaps() {
    this.keyToActions.clear();
    this.mouseToActions.clear();
    this.gamepadButtons = [];
    this.gamepadAxes = [];

    const actions = this.config?.actions ?? {};
    for (const [action, def] of Object.entries(actions)) {
      for (const code of def.keyboard ?? []) {
        addTo(this.keyToActions, normalizeKey(code), action);
      }
      for (const btn of def.mouse ?? []) {
        addTo(this.mouseToActions, String(btn).toLowerCase(), action);
      }
      const pad = def.gamepad ?? {};
      for (const button of [...(pad.buttons ?? []), ...(pad.triggers ?? [])]) {
        this.gamepadButtons.push({ action, button });
      }
      for (const axis of pad.axes ?? []) {
        this.gamepadAxes.push({ action, index: axis.index, direction: axis.direction ?? 1 });
      }
    }
  }

  /** Reasigna una acción en caliente y persiste opcionalmente en localStorage. */
  rebind(action, { keyboard, mouse, gamepad } = {}, { persist = true } = {}) {
    if (!this.config?.actions?.[action]) return false;
    const def = this.config.actions[action];
    if (keyboard) def.keyboard = keyboard;
    if (mouse) def.mouse = mouse;
    if (gamepad) def.gamepad = gamepad;
    this.rebuildMaps();
    if (persist && typeof localStorage !== 'undefined') {
      try { localStorage.setItem('gandia.keybindings', JSON.stringify(this.config)); } catch { /* noop */ }
    }
    return true;
  }

  /** Restaura desde localStorage un mapeo personalizado previamente guardado. */
  loadUserOverrides() {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem('gandia.keybindings');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed?.actions) { this.config = parsed; this.rebuildMaps(); return true; }
    } catch { /* noop */ }
    return false;
  }

  /* ------------------------------------------------------- Listeners */

  attach() {
    const t = this.target;
    if (!t || this._listeners.length) return;

    const on = (type, handler, opts) => {
      t.addEventListener(type, handler, opts);
      this._listeners.push([type, handler, opts]);
    };

    on('keydown', (e) => this._onKey(e, true));
    on('keyup', (e) => this._onKey(e, false));
    on('mousedown', (e) => this._onMouse(e, true));
    on('mouseup', (e) => this._onMouse(e, false));
    on('contextmenu', (e) => { if (this.mouseToActions.has('right')) e.preventDefault(); });
    on('mousemove', (e) => {
      const s = this.settings.mouseSensitivity ?? 1;
      this.pointerDelta.x += (e.movementX ?? 0) * s;
      this.pointerDelta.y += (e.movementY ?? 0) * s * (this.settings.invertLookY ? -1 : 1);
    });
    on('wheel', (e) => { this.wheelDelta += e.deltaY; }, { passive: true });
    on('blur', () => this.reset());
  }

  detach() {
    const t = this.target;
    if (!t) return;
    for (const [type, handler, opts] of this._listeners) t.removeEventListener(type, handler, opts);
    this._listeners = [];
  }

  dispose() {
    this.detach();
    this.reset();
  }

  get settings() {
    return this.config?.settings ?? {};
  }

  _shouldIgnore(event) {
    const tags = this.settings.ignoreWhenTypingIn ?? [];
    const tag = event?.target?.tagName;
    return !!tag && tags.includes(tag);
  }

  _onKey(event, isDown) {
    if (this._shouldIgnore(event)) return;
    const code = normalizeKey(event.code || event.key);
    const actions = this.keyToActions.get(code);
    if (!actions) return;
    if (isDown && event.repeat) return;
    for (const action of actions) this._setAction(action, isDown);
  }

  _onMouse(event, isDown) {
    if (this._shouldIgnore(event)) return;
    const name = MOUSE_BUTTON_NAMES[event.button] ?? `button${event.button}`;
    const actions = this.mouseToActions.get(name);
    if (!actions) return;
    for (const action of actions) this._setAction(action, isDown);
  }

  _setAction(action, isDown) {
    if (isDown) {
      if (!this.active.has(action)) {
        this.active.add(action);
        this.pressed.add(action);
        this.buffer.push({ action, time: now() });
      }
    } else if (this.active.delete(action)) {
      this.released.add(action);
    }
  }

  /* ---------------------------------------------------------- Gamepad */

  pollGamepads() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.getGamepads) return;
    const pads = nav.getGamepads() || [];
    const deadzone = this.settings.gamepadDeadzone ?? 0.2;
    const threshold = this.settings.gamepadAxisThreshold ?? 0.5;

    const held = new Set();
    for (const pad of pads) {
      if (!pad) continue;
      for (const { action, button } of this.gamepadButtons) {
        const b = pad.buttons?.[button];
        if (b && (b.pressed || b.value > deadzone)) held.add(action);
      }
      for (const { action, index, direction } of this.gamepadAxes) {
        const value = pad.axes?.[index] ?? 0;
        if (Math.abs(value) > threshold && Math.sign(value) === Math.sign(direction)) held.add(action);
      }
    }

    for (const action of held) if (!this.active.has(action)) this._setAction(action, true);
    for (const { action } of this.gamepadButtons) {
      if (!held.has(action) && this._padOwned?.has(action)) this._setAction(action, false);
    }
    this._padOwned = held;
  }

  /* -------------------------------------------------- API por frame */

  /** Llamar al inicio del frame: refresca gamepad y limpia el búfer viejo. */
  beginFrame() {
    this.pollGamepads();
    const cutoff = now() - this._bufferWindowMs;
    while (this.buffer.length && this.buffer[0].time < cutoff) this.buffer.shift();
  }

  /** Llamar al final del frame: consume los flags de flanco. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.pointerDelta.x = 0;
    this.pointerDelta.y = 0;
    this.wheelDelta = 0;
  }

  isDown(action) { return this.active.has(action) || this.virtual.has(action); }
  wasPressed(action) { return this.pressed.has(action); }
  wasReleased(action) { return this.released.has(action); }

  /** Eje virtual compuesto por dos acciones: axis('STEER_LEFT','STEER_RIGHT'). */
  axis(negativeAction, positiveAction) {
    return (this.isDown(positiveAction) ? 1 : 0) - (this.isDown(negativeAction) ? 1 : 0);
  }

  /** Consume del búfer una acción reciente (para ventanas de combo). */
  consumeBuffered(action, windowMs = this._bufferWindowMs) {
    const cutoff = now() - windowMs;
    for (let i = this.buffer.length - 1; i >= 0; i -= 1) {
      const entry = this.buffer[i];
      if (entry.action === action && entry.time >= cutoff) {
        this.buffer.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /** Entradas virtuales del HUD táctil: setVirtual('MOVE_FORWARD', true). */
  setVirtual(action, isDown) {
    if (isDown) {
      if (!this.virtual.has(action)) {
        this.virtual.add(action);
        this.pressed.add(action);
        this.buffer.push({ action, time: now() });
      }
    } else if (this.virtual.delete(action)) {
      this.released.add(action);
    }
  }

  /** Aplica de golpe un objeto { MOVE_FORWARD: true, STEER_LEFT: false }. */
  applyVirtualState(state = {}) {
    for (const [action, value] of Object.entries(state)) this.setVirtual(action, !!value);
  }

  /** Instantánea inmutable del estado, útil para pasarla a los controladores. */
  snapshot() {
    return {
      isDown: (a) => this.isDown(a),
      wasPressed: (a) => this.wasPressed(a),
      axis: (n, p) => this.axis(n, p),
      pointerDelta: { ...this.pointerDelta },
      wheelDelta: this.wheelDelta,
    };
  }

  reset() {
    this.active.clear();
    this.pressed.clear();
    this.released.clear();
    this.virtual.clear();
    this.buffer.length = 0;
  }

  /** Lista legible de asignaciones, para una pantalla de opciones. */
  describeBindings() {
    return Object.entries(this.config?.actions ?? {}).map(([action, def]) => ({
      action,
      label: def.label ?? action,
      keyboard: def.keyboard ?? [],
      mouse: def.mouse ?? [],
      gamepad: def.gamepad ?? {},
    }));
  }
}

/* ------------------------------------------------------------ helpers */

function addTo(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

/** Normaliza `KeyW`, `w`, `ArrowUp`, `' '` a una clave estable. */
function normalizeKey(raw) {
  if (!raw) return '';
  const code = String(raw);
  if (code === ' ') return 'Space';
  if (/^[a-z]$/i.test(code) && code.length === 1) return `Key${code.toUpperCase()}`;
  return code;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export default InputManager;
