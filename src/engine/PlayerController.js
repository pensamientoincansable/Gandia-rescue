/**
 * PlayerController — física del jugador (furgoneta y guardián a pie) y
 * máquina de estados de combate/combos.
 *
 * TODO parámetro numérico procede de:
 *   · `config/player_stats.json`  → velocidades, aceleración, gravedad, vida…
 *   · `config/moveset.json`       → combos, hitframes, cancelación, daño, knockback.
 *
 * El controlador es agnóstico del renderizador: trabaja con vectores planos
 * `{x, y, z}` y recibe un `terrain` opcional con `getHeight(x, z, zoneId)`.
 * Quien renderice (Three.js, Canvas…) sólo lee `controller.state`.
 */

import { loadConfig } from './ConfigLoader.js';

export class PlayerController {
  /**
   * Fábrica asíncrona: carga stats y moveset por fetch() antes de construir.
   */
  static async create(options = {}) {
    const [stats, moveset] = await Promise.all([
      loadConfig(options.statsFile ?? 'player_stats.json', options.statsFallback),
      loadConfig(options.movesetFile ?? 'moveset.json', options.movesetFallback),
    ]);
    return new PlayerController({ ...options, stats, moveset });
  }

  constructor({ stats, moveset, terrain = null, zoneId = 'platja' } = {}) {
    if (!stats || !moveset) {
      throw new Error('[PlayerController] Usa PlayerController.create() para cargar la configuración.');
    }
    this.stats = stats;
    this.moveset = moveset;
    this.terrain = terrain;
    this.zoneId = zoneId;

    const { vitals, world } = stats;

    /** Estado observable por la capa de render / HUD. */
    this.state = {
      mode: 'vehicle',            // 'vehicle' | 'foot'
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      heading: 0,
      pitch: 0,
      roll: 0,
      speed: 0,
      steerAngle: 0,
      grounded: true,
      health: vitals.startHealth,
      maxHealth: vitals.maxHealth,
      stamina: vitals.maxStamina,
      maxStamina: vitals.maxStamina,
      invulnerableFor: 0,
      dashCooldown: 0,
      currentMove: null,          // { id, frame, def }
      comboChain: [],
      comboIdleFrames: 0,
      hitstopFrames: 0,
      lastHits: [],               // resultados del último frame activo
    };

    this.maxDelta = world?.maxDeltaSeconds ?? 0.06;
    this.frameDuration = 1 / (moveset.frameRate ?? 60);
    this._frameAccumulator = 0;
  }

  /* --------------------------------------------------------- utilidades */

  setZone(zoneId) { this.zoneId = zoneId; }

  setPosition(x, z, heading = 0) {
    const y = this.terrain?.getHeight?.(x, z, this.zoneId) ?? 0;
    Object.assign(this.state.position, { x, y, z });
    this.state.heading = heading;
    this.state.speed = 0;
    this.state.steerAngle = 0;
    this.state.velocity = { x: 0, y: 0, z: 0 };
  }

  /**
   * Baja del vehículo colocando al jugador a un lado de la puerta del
   * conductor (CORRECCIÓN del bug de teleporte a (0,0,0) o al spawn).
   *
   * Toma la posición global actual del vehículo (`this.state.position`),
   * calcula un vector de separación lateral seguro (2 m) perpendicular a la
   * dirección de marcha y sitúa al jugador en ese punto contiguo ANTES de
   * activar sus controles y físicas a pie.
   */
  exitVehicle() {
    if (this.state.mode === 'foot') return this.state.mode;
    const s = this.state;
    const dist = this.stats.ranger.dismountDistance ?? 2.0;
    const side = this.stats.ranger.doorSide ?? 1; // 1 = puerta del conductor

    // Dirección de marcha: fwd = (sin heading, cos heading). El vector normal
    // (perpendicular) hacia el lado de la puerta es (cos heading, -sin heading).
    const sinH = Math.sin(s.heading);
    const cosH = Math.cos(s.heading);
    const offsetX = side * dist * cosH;
    const offsetZ = -side * dist * sinH;

    // Punto contiguo a la furgoneta (no el origen ni el spawn).
    s.position.x += offsetX;
    s.position.z += offsetZ;

    // Altura real del suelo bajo ese punto antes de reactivar las físicas.
    const groundY = this.terrain?.getGroundHeight?.(s.position.x, s.position.z, this.zoneId, s.position.y + 2)
      ?? this.terrain?.getHeight?.(s.position.x, s.position.z, this.zoneId)
      ?? s.position.y;

    s.mode = 'foot';
    s.position.y = groundY;
    s.speed = 0;
    s.steerAngle = 0;
    s.velocity = { x: 0, y: 0, z: 0 };
    s.grounded = true;
    return s.mode;
  }

  /** Vuelve a subir al vehículo. */
  mount() {
    if (this.state.mode !== 'foot') return this.state.mode;
    this.state.mode = 'vehicle';
    this.state.speed = 0;
    this.state.steerAngle = 0;
    this.state.velocity = { x: 0, y: 0, z: 0 };
    return this.state.mode;
  }

  /** Alias explícito de "bajar de la furgoneta". */
  dismount() {
    return this.exitVehicle();
  }

  toggleMode() {
    return this.state.mode === 'vehicle' ? this.exitVehicle() : this.mount();
  }

  /* ------------------------------------------------------------ update */

  /**
   * Avanza la simulación un frame.
   * @param {number} rawDelta segundos transcurridos.
   * @param {{isDown:Function, wasPressed:Function, axis:Function}} input Snapshot del InputManager.
   * @param {Array} [targets] entidades golpeables: { id, position, size, state, applyHit(res) }.
   */
  update(rawDelta, input, targets = []) {
    const delta = Math.min(this.maxDelta, Math.max(0, rawDelta));
    this._updateTimers(delta);

    if (this.state.hitstopFrames > 0) {
      this.state.hitstopFrames -= 1;
      return this.state;
    }

    if (this.state.mode === 'vehicle') this._updateVehicle(delta, input);
    else this._updateFoot(delta, input);

    this._updateCombat(delta, input, targets);
    this._clampToWorld();
    return this.state;
  }

  _updateTimers(delta) {
    const s = this.state;
    const { vitals } = this.stats;
    s.invulnerableFor = Math.max(0, s.invulnerableFor - delta);
    s.dashCooldown = Math.max(0, s.dashCooldown - delta);
    s.stamina = Math.min(s.maxStamina, s.stamina + vitals.staminaRegenPerSecond * delta);
  }

  /* ----------------------------------------------------- física furgoneta */

  _updateVehicle(delta, input) {
    const v = this.stats.vehicle;
    const s = this.state;

    const throttle = input.axis('MOVE_BACKWARD', 'MOVE_FORWARD');
    const steerInput = input.axis('STEER_RIGHT', 'STEER_LEFT');
    const boosting = input.isDown('DASH') ? v.boostMultiplier : 1;
    const maxSpeed = v.maxSpeed * boosting;

    if (throttle > 0) {
      s.speed = Math.min(maxSpeed, s.speed + v.acceleration * delta);
    } else if (throttle < 0) {
      if (s.speed > v.brakeThresholdSpeed) {
        s.speed = Math.max(0, s.speed - v.brakeForce * delta);
      } else {
        s.speed = Math.max(-v.maxSpeed * v.reverseSpeedFactor, s.speed - v.acceleration * v.reverseAccelerationFactor * delta);
      }
    } else if (s.speed > 0) {
      s.speed = Math.max(0, s.speed - v.friction * delta);
    } else if (s.speed < 0) {
      s.speed = Math.min(0, s.speed + v.friction * delta);
    }

    if (input.isDown('HANDBRAKE')) {
      s.speed = Math.max(0, s.speed - v.brakeForce * v.handbrakeMultiplier * delta);
    }

    // Dirección con suavizado
    const targetSteer = steerInput * v.maxSteer;
    s.steerAngle += (targetSteer - s.steerAngle) * Math.min(1, delta * v.steerLerpSpeed);

    if (Math.abs(s.speed) > v.minSpeedToTurn) {
      const dir = s.speed > 0 ? 1 : -1;
      s.heading += s.steerAngle * (s.speed / v.turnSpeedReference) * delta * dir * v.turnRateMultiplier;
    }

    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    s.position.x += fx * s.speed * delta;
    s.position.z += fz * s.speed * delta;
    s.velocity.x = fx * s.speed;
    s.velocity.z = fz * s.speed;

    this._settleOnTerrain(delta, v, fx, fz);
  }

  _settleOnTerrain(delta, v, fx, fz) {
    const s = this.state;
    if (!this.terrain?.getHeight) return;
    const h = (x, z) => this.terrain.getHeight(x, z, this.zoneId);

    const groundY = h(s.position.x, s.position.z);
    s.position.y += (groundY - s.position.y) * Math.min(1, delta * v.suspensionLerpSpeed);

    const d = v.pitchSampleDistance;
    const aheadY = h(s.position.x + fx * d, s.position.z + fz * d);
    s.pitch = Math.atan2(aheadY - groundY, d);

    const rd = v.rollSampleDistance;
    const rx = Math.cos(s.heading);
    const rz = -Math.sin(s.heading);
    const rY = h(s.position.x + rx * rd, s.position.z + rz * rd);
    const lY = h(s.position.x - rx * rd, s.position.z - rz * rd);
    s.roll = Math.atan2(rY - lY, rd * 2);
  }

  /* --------------------------------------------------- física a pie */

  _updateFoot(delta, input) {
    const r = this.stats.ranger;
    const s = this.state;

    const forward = input.axis('MOVE_BACKWARD', 'MOVE_FORWARD');
    const turn = input.axis('STEER_RIGHT', 'STEER_LEFT');
    s.heading += turn * r.turnSpeed * delta;

    const sprinting = input.isDown('HANDBRAKE');
    const targetSpeed = forward * (sprinting ? r.sprintSpeed : r.walkSpeed);
    const rate = forward === 0 ? r.friction : r.acceleration;
    s.speed += (targetSpeed - s.speed) * Math.min(1, delta * rate);

    // Dash con coste de resistencia (parámetros del moveset + stats)
    if (input.wasPressed('DASH') && s.dashCooldown <= 0 && s.stamina >= this.stats.vitals.dashStaminaCost) {
      s.dashCooldown = r.dashCooldownSeconds;
      s.stamina -= this.stats.vitals.dashStaminaCost;
      s.speed = Math.sign(forward || 1) * r.dashSpeed;
      this._startMove('DASH');
    }

    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    s.position.x += fx * s.speed * delta;
    s.position.z += fz * s.speed * delta;
    s.velocity.x = fx * s.speed;
    s.velocity.z = fz * s.speed;

    // Salto y gravedad con colisión vertical por raycasting + CCD.
    const groundAt = (x, z, fromY = 0) => this.terrain?.getGroundHeight
      ? this.terrain.getGroundHeight(x, z, this.zoneId, fromY)
      : (this.terrain?.getHeight?.(x, z, this.zoneId) ?? 0);

    const groundY = groundAt(s.position.x, s.position.z, s.position.y + 0.5);
    if (s.grounded && input.wasPressed('JUMP')) {
      s.velocity.y = r.jumpForce;
      s.grounded = false;
    }
    if (!s.grounded) {
      // Detección continua: sub-pasos para no atravesar superficies finas.
      let y = s.position.y;
      let vy = s.velocity.y;
      let remaining = delta;
      let landed = false;
      while (remaining > 0 && !landed) {
        const dt = Math.min(0.016, remaining);
        vy = Math.max(r.maxFallSpeed, vy + r.gravity * dt);
        const nextY = y + vy * dt;
        const g = groundAt(s.position.x, s.position.z, y + 0.5);
        if (nextY <= g) {
          y = g; vy = 0; landed = true;
        } else {
          y = nextY;
        }
        remaining -= dt;
      }
      s.position.y = y;
      s.velocity.y = vy;
      s.grounded = landed;
    } else {
      s.position.y = groundY;
    }
  }

  /* ------------------------------------------------------- combate */

  _updateCombat(delta, input, targets) {
    const s = this.state;
    s.lastHits = [];

    this._frameAccumulator += delta;
    let frames = 0;
    while (this._frameAccumulator >= this.frameDuration) {
      this._frameAccumulator -= this.frameDuration;
      frames += 1;
    }

    // 1. Intentar iniciar/encadenar un movimiento según la entrada
    for (const [id, def] of Object.entries(this.moveset.moves)) {
      if (def.input && input.wasPressed(def.input) && this._canStart(id, def)) {
        this._startMove(id);
        break;
      }
    }

    // 2. Avanzar el movimiento activo frame a frame
    for (let i = 0; i < frames; i += 1) this._advanceMoveOneFrame(targets);

    // 3. Expirar la cadena de combo si el jugador se queda quieto
    if (!s.currentMove && s.comboChain.length) {
      s.comboIdleFrames += frames;
      if (s.comboIdleFrames >= this.moveset.global.comboResetFrames) {
        s.comboChain = [];
        s.comboIdleFrames = 0;
      }
    }
  }

  _canStart(id, def) {
    const s = this.state;
    if (def.staminaCost && s.stamina < def.staminaCost) return false;

    if (!s.currentMove) {
      // Fuera de un movimiento: sólo si no requiere predecesor o la cadena encaja
      if (!def.requiresPrevious) return true;
      return s.comboChain[s.comboChain.length - 1] === def.requiresPrevious;
    }

    // Dentro de un movimiento: sólo por ventana de cancelación
    const cur = s.currentMove;
    const win = cur.def.cancelWindow;
    const allowed = cur.def.cancelInto ?? [];
    if (!win || !allowed.includes(id)) return false;
    if (cur.frame < win.startFrame || cur.frame > win.endFrame) return false;
    if (def.requiresPrevious && def.requiresPrevious !== cur.id) return false;
    return true;
  }

  _startMove(id) {
    const def = this.moveset.moves[id];
    if (!def) return false;
    const s = this.state;
    s.currentMove = { id, def, frame: 0, hitTargets: new Set() };
    s.comboChain.push(id);
    s.comboIdleFrames = 0;
    if (def.staminaCost) s.stamina = Math.max(0, s.stamina - def.staminaCost);
    return true;
  }

  _advanceMoveOneFrame(targets) {
    const s = this.state;
    const move = s.currentMove;
    if (!move) return;

    move.frame += 1;
    const { def } = move;
    const activeStart = def.startupFrames;
    const activeEnd = def.startupFrames + def.activeFrames;

    // Invulnerabilidad definida por frames (esquivas)
    const inv = def.invulnerableFrames;
    if (inv && move.frame >= inv.startFrame && move.frame <= inv.endFrame) {
      s.invulnerableFor = Math.max(s.invulnerableFor, this.frameDuration * 2);
    }

    if (move.frame > activeStart && move.frame <= activeEnd && def.hitbox) {
      this._resolveHits(move, targets);
    }

    const total = activeEnd + def.recoveryFrames;
    if (move.frame >= total) {
      s.currentMove = null;
      s.comboIdleFrames = 0;
    }
  }

  /** Calcula impactos del frame activo aplicando la tabla de daño del JSON. */
  _resolveHits(move, targets) {
    const s = this.state;
    const { def } = move;
    const hb = def.hitbox;
    const origin = this._localToWorld(hb.offset ?? [0, 0, 0]);

    for (const target of targets ?? []) {
      if (!target?.position || move.hitTargets.has(target.id)) continue;
      const dx = target.position.x - origin.x;
      const dy = (target.position.y ?? 0) - origin.y;
      const dz = target.position.z - origin.z;
      const reach = hb.radius + (target.radius ?? 0);
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;

      move.hitTargets.add(target.id);
      const result = this.computeDamage(def.id ?? move.id, target);
      s.lastHits.push({ targetId: target.id, ...result });
      s.hitstopFrames = this.moveset.global.hitstopFrames;
      target.applyHit?.(result);
    }
  }

  /**
   * Daño y knockback resultantes de un movimiento sobre un objetivo,
   * aplicando multiplicadores de `moveset.damageTable` y bonus de combo.
   */
  computeDamage(moveId, target = {}) {
    const def = this.moveset.moves[moveId];
    const table = this.moveset.damageTable ?? {};
    const sizeMul = table.multipliersByTargetSize?.[target.size ?? 'medium'] ?? 1;
    const stateMul = table.multipliersByState?.[target.state ?? 'idle'] ?? 1;

    const combo = this._matchedCombo(moveId);
    const bonus = combo?.finisherBonusDamage ?? 0;
    const kbMul = combo?.finisherKnockbackMultiplier ?? 1;

    const damage = ((def.damage ?? 0) + bonus) * sizeMul * stateMul;
    const kb = def.knockback ?? { force: 0, angleDeg: 0 };
    const angle = this.state.heading + (kb.angleDeg * Math.PI) / 180;

    return {
      moveId,
      damage: Math.round(damage * 100) / 100,
      stunFrames: def.stunFrames ?? 0,
      knockback: {
        force: kb.force * kbMul,
        x: Math.sin(angle) * kb.force * kbMul,
        z: Math.cos(angle) * kb.force * kbMul,
        decay: this.moveset.global.knockbackDecay,
      },
      comboId: combo?.id ?? null,
    };
  }

  /** ¿La cadena actual termina justo con una secuencia de combo completa? */
  _matchedCombo(moveId) {
    const chain = [...this.state.comboChain];
    if (chain[chain.length - 1] !== moveId) chain.push(moveId);
    return (this.moveset.combos ?? []).find((combo) => {
      const seq = combo.sequence;
      if (chain.length < seq.length) return false;
      const tail = chain.slice(-seq.length);
      return tail.every((id, i) => id === seq[i]);
    }) ?? null;
  }

  /* ----------------------------------------------------------- daño */

  applyDamage(amount, knockback = null) {
    const s = this.state;
    if (s.invulnerableFor > 0) return false;
    s.health = Math.max(0, s.health - amount);
    s.invulnerableFor = this.stats.vitals.invulnerabilitySeconds;
    if (knockback) {
      s.velocity.x += knockback.x ?? 0;
      s.velocity.z += knockback.z ?? 0;
    }
    return true;
  }

  heal(amount) {
    this.state.health = Math.min(this.state.maxHealth, this.state.health + amount);
    return this.state.health;
  }

  get isAlive() { return this.state.health > 0; }

  /** Velocidad en km/h, tal y como la muestra el HUD. */
  get speedKmh() { return Math.round(this.state.speed * 3.6); }

  /* -------------------------------------------------------- helpers */

  _localToWorld([ox, oy, oz]) {
    const { position, heading } = this.state;
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    return {
      x: position.x + ox * cos + oz * sin,
      y: position.y + oy,
      z: position.z - ox * sin + oz * cos,
    };
  }

  _clampToWorld() {
    const { boundsMin, boundsMax } = this.stats.world;
    const p = this.state.position;
    p.x = Math.max(boundsMin, Math.min(boundsMax, p.x));
    p.z = Math.max(boundsMin, Math.min(boundsMax, p.z));
  }
}

export default PlayerController;
