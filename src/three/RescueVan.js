import * as THREE from 'three';
import { createRescueVanDecal } from './TextureFactory.js';
import { DEFAULT_PLAYER_STATS } from '../engine/defaults.js';
import { AnimatedEntity } from './AnimatedEntity.js';
import { loadModelsManifest } from './ModelLoader.js';

/**
 * Furgoneta 3D de Rescate y Conservación de Gandía.
 * - Chasis detallado con calcomanías oficiales de Gandía Rescate.
 * - Ruedas direccionales delanteras y rodadura física sincronizada con la velocidad.
 * - Puente de luces de emergencia LED (rotativos azul/ámbar) con foco pulsante.
 * - Faros delanteros de largo alcance con iluminación nocturna.
 * - Baca con escalera de rescate, rueda de repuesto y antena de radio.
 * - Física de conducción suave (aceleración, giro, freno, marcha atrás y amortiguación).
 * - Sintetizador de audio Web Audio API (motor, sirena y claxon sin depender de archivos de audio).
 * - Modos de cámara dinámicos (3ª persona, cabina 1ª persona, vista cenital y modo guardián a pie).
 */

export class RescueVan {
  /**
   * @param {THREE.Scene} scene
   * @param {object} terrainBuilder
   * @param {object} [stats] Configuración de `player_stats.json` (inyectada).
   *   Si no se pasa, se usa la copia empaquetada como respaldo.
   */
  constructor(scene, terrainBuilder, stats = DEFAULT_PLAYER_STATS) {
    this.scene = scene;
    this.terrain = terrainBuilder;
    this.stats = stats;
    this.cfg = stats.vehicle;
    this.rangerCfg = stats.ranger;
    this.worldCfg = stats.world;
    this.cameraCfg = stats.camera;
    this.audioCfg = stats.audio;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Estado físico del vehículo
    this.position = new THREE.Vector3(0, 0, 0);
    this.heading = 0; // Ángulo de rotación Y en radianes
    this.speed = 0;   // Velocidad lineal actual
    this.steerAngle = 0; // Ángulo de giro de ruedas
    // Parámetros de física leídos de player_stats.json (sin valores fijos)
    this.maxSpeed = this.cfg.maxSpeed;
    this.accel = this.cfg.acceleration;
    this.brakeForce = this.cfg.brakeForce;
    this.friction = this.cfg.friction;
    this.maxSteer = this.cfg.maxSteer;

    // Estado de equipamiento
    this.sirenActive = false;
    this.headlightsActive = true;
    this.cameraMode = this.cameraCfg.modes?.[0] ?? 'chase'; // 'chase' | 'hood' | 'top' | 'foot'
    this.isFootMode = false;
    this.zoneId = 'platja';
    this.rangerPosition = new THREE.Vector3(0, 0, 0);
    this.rangerHeading = 0;

    // Física vertical del guardián (salto / gravedad / colisión).
    this.rangerVy = 0;
    this.rangerGrounded = true;

    /**
     * Radios de colisión. El de la furgoneta es su media anchura real
     * (2,4 m de caja → 1,7 m de radio útil) y el del guardián, su hombro.
     * Antes no existían: por eso el vehículo atravesaba árboles y fachadas.
     */
    this.collisionRadius = this.cfg.collisionRadius ?? 1.7;
    this.rangerCollisionRadius = this.rangerCfg.collisionRadius ?? 0.45;

    // Inclinación suavizada (el cabeceo y el alabeo ya no se calculan en
    // crudo cada fotograma: se interpola y se limita a un máximo sensato).
    this.smoothPitch = 0;
    this.smoothRoll = 0;
    this.lastImpact = 0;

    // Avatar del guardián a pie (modelo detallado con AnimationMixer, o monigote).
    this.rangerGroup = new THREE.Group();
    this.rangerGroup.visible = false;
    this.scene.add(this.rangerGroup);
    this.rangerAvatar = null;
    this._initRangerAvatar();

    // Mallas y piezas móviles
    this.wheels = [];
    this.frontWheelHolders = [];
    this.sirenLights = [];
    this.headlights = [];
    this.spotlights = [];

    // Sintetizador de audio Web Audio API
    this.audioCtx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.isAudioStarted = false;

    // Construcción de la geometría 3D
    this.buildVanModel();
  }

  /** Construye la malla 3D de la furgoneta */
  buildVanModel() {
    const tealMat = new THREE.MeshStandardMaterial({ color: 0x009e86, roughness: 0.35, metalness: 0.1 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.4, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.75 });
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf06f3c, roughness: 0.4 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.2, metalness: 0.8 });

    // 1. Chasis principal
    const bodyLower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 5.2), tealMat);
    bodyLower.position.y = 0.95;
    bodyLower.castShadow = true;
    this.group.add(bodyLower);

    // Franja lateral blanca con calcomanía
    const decalMat = new THREE.MeshStandardMaterial({
      map: createRescueVanDecal(),
      roughness: 0.4,
    });
    const sideDecal = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.5, 4.4), decalMat);
    sideDecal.position.y = 1.05;
    this.group.add(sideDecal);

    // 2. Cabina superior y techo
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.25, 4.6), whiteMat);
    cabin.position.set(0, 2.05, -0.2);
    cabin.castShadow = true;
    this.group.add(cabin);

    // Parabrisas frontal inclinado
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.2), glassMat);
    windshield.position.set(0, 2.1, 1.95);
    windshield.rotation.x = -Math.PI / 10;
    this.group.add(windshield);

    // Ventanas laterales
    for (const sx of [-1.17, 1.17]) {
      const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 3.2), glassMat);
      sideWin.position.set(sx, 2.1, -0.2);
      this.group.add(sideWin);
    }

    // Ventana trasera
    const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.1), glassMat);
    rearWin.position.set(0, 2.1, -2.52);
    this.group.add(rearWin);

    // Parachoques delantero y trasero
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.45, 0.4), darkMat);
    frontBumper.position.set(0, 0.55, 2.65);
    this.group.add(frontBumper);

    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.45, 0.4), darkMat);
    rearBumper.position.set(0, 0.55, -2.65);
    this.group.add(rearBumper);

    // 3. Faros delanteros LED
    for (const hx of [-0.85, 0.85]) {
      const headlightMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.28, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 })
      );
      headlightMesh.position.set(hx, 0.95, 2.64);
      this.group.add(headlightMesh);

      // Foco de luz real proyectado hacia delante
      const spot = new THREE.SpotLight(0xfff4e0, 2.5, 38, Math.PI / 5, 0.4, 1.5);
      spot.position.set(hx, 1.0, 2.7);
      const target = new THREE.Object3D();
      target.position.set(hx * 0.4, 0.2, 25);
      this.group.add(target);
      spot.target = target;
      this.group.add(spot);
      this.headlights.push(spot);
    }

    // Luces traseras de freno rojas
    for (const rx of [-0.9, 0.9]) {
      const tailMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.35, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0xaa1111, emissiveIntensity: 0.8 })
      );
      tailMesh.position.set(rx, 1.05, -2.62);
      this.group.add(tailMesh);
    }

    // 4. Puente de luces de emergencia en el techo
    const lightbarBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.35), darkMat);
    lightbarBase.position.set(0, 2.75, 0.6);
    this.group.add(lightbarBase);

    // Balizas LED azul y ámbar
    const beaconBlueMat = new THREE.MeshStandardMaterial({ color: 0x00b4d8, emissive: 0x0096c7, emissiveIntensity: 2 });
    const beaconAmberMat = new THREE.MeshStandardMaterial({ color: 0xffb703, emissive: 0xfb8500, emissiveIntensity: 2 });

    const beaconLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.3), beaconBlueMat);
    beaconLeft.position.set(-0.45, 2.9, 0.6);
    this.group.add(beaconLeft);

    const beaconRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.3), beaconAmberMat);
    beaconRight.position.set(0.45, 2.9, 0.6);
    this.group.add(beaconRight);

    // Focos puntuales de sirena
    const sirenPoint = new THREE.PointLight(0x00b4d8, 0, 16);
    sirenPoint.position.set(0, 3.2, 0.6);
    this.group.add(sirenPoint);
    this.sirenLights.push({ light: sirenPoint, blue: beaconLeft, amber: beaconRight });

    // 5. Baca de rescate con escalera y rueda de repuesto
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 });
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 2.8), rackMat);
    rack.position.set(0, 2.75, -1.1);
    this.group.add(rack);

    // Escalera lateral
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.1), chromeMat);
    ladder.position.set(-1.22, 1.8, -2.2);
    this.group.add(ladder);

    // Rueda de repuesto en el techo
    const spareTire = this.createWheelMesh();
    spareTire.rotation.x = Math.PI / 2;
    spareTire.position.set(0.35, 2.9, -1.2);
    this.group.add(spareTire);

    // Antena de telecomunicaciones
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 1.4), chromeMat);
    antenna.position.set(-0.8, 3.4, 1.4);
    antenna.rotation.x = -0.15;
    this.group.add(antenna);

    // 6. Ruedas (4 ruedas con amortiguación y dirección)
    const wheelPositions = [
      { x: -1.18, z: 1.6, isFront: true },
      { x: 1.18, z: 1.6, isFront: true },
      { x: -1.18, z: -1.6, isFront: false },
      { x: 1.18, z: -1.6, isFront: false },
    ];

    for (const pos of wheelPositions) {
      const holder = new THREE.Group();
      holder.position.set(pos.x, 0.48, pos.z);

      const wheel = this.createWheelMesh();
      holder.add(wheel);
      this.group.add(holder);

      this.wheels.push(wheel);
      if (pos.isFront) this.frontWheelHolders.push(holder);
    }
  }

  /** Crea el avatar a pie del jugador usando el manifiesto de modelos. */
  _initRangerAvatar() {
    // Monigote de respaldo mientras no haya un .glb del guardián.
    const fallback = this.buildRangerFallbackMesh();
    this.rangerAvatar = new AnimatedEntity({
      path: null,
      buildFallback: () => fallback,
      motion: 'idle',
      scale: 1,
    });
    this.rangerGroup.add(this.rangerAvatar.root);

    // Intenta cargar el modelo 3D detallado con sus animaciones (asíncrono).
    loadModelsManifest().then((manifest) => {
      const cfg = manifest?.ranger;
      if (!cfg?.path) return;
      this.rangerAvatar = new AnimatedEntity({
        path: cfg.path,
        animations: cfg.animations ?? {},
        motion: 'idle',
        scale: 1,
      });
      this.rangerGroup.clear();
      this.rangerGroup.add(this.rangerAvatar.root);
    }).catch(() => { /* mantiene el monigote */ });
  }

  /** Humanoid simple de primitivas usado si no hay modelo GLTF. */
  buildRangerFallbackMesh() {
    const group = new THREE.Group();
    const rangerMat = new THREE.MeshStandardMaterial({ color: 0x00a88f, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5cba7, roughness: 0.6 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), rangerMat);
    torso.position.y = 1.15;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), skinMat);
    head.position.y = 1.72;
    group.add(head);

    for (const lx of [-0.17, 0.17]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.24), pantsMat);
      leg.position.set(lx, 0.44, 0);
      group.add(leg);
    }
    return group;
  }

  createWheelMesh() {
    const group = new THREE.Group();
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.8, roughness: 0.2 });

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.38, 16), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    group.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    group.add(rim);

    return group;
  }

  /** Inicializa el sintetizador Web Audio tras la primera interacción */
  initAudio() {
    if (this.isAudioStarted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioCtx = new AudioContext();

      // Oscilador de motor
      this.engineOsc = this.audioCtx.createOscillator();
      this.engineGain = this.audioCtx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(55, this.audioCtx.currentTime);
      this.engineGain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, this.audioCtx.currentTime);

      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.audioCtx.destination);
      this.engineOsc.start();

      this.isAudioStarted = true;
    } catch (e) {
      console.warn('Web Audio no disponible:', e);
    }
  }

  /** Toca el claxon de la furgoneta */
  honk() {
    this.initAudio();
    if (!this.audioCtx) return;
    try {
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      const [f1, f2] = this.audioCfg.hornFrequencies;
      const decay = this.audioCfg.hornDecaySeconds;
      osc1.frequency.setValueAtTime(f1, this.audioCtx.currentTime);
      osc2.frequency.setValueAtTime(f2, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(this.audioCfg.hornGain, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + decay);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(this.audioCtx.currentTime + this.audioCfg.hornDecaySeconds + 0.01);
      osc2.stop(this.audioCtx.currentTime + this.audioCfg.hornDecaySeconds + 0.01);
    } catch (e) {
      /* noop */
    }
  }

  /** Alterna la sirena de emergencia */
  toggleSiren() {
    this.sirenActive = !this.sirenActive;
    this.initAudio();
  }

  /** Alterna los faros delanteros */
  toggleHeadlights() {
    this.headlightsActive = !this.headlightsActive;
    for (const h of this.headlights) h.visible = this.headlightsActive;
  }

  /**
   * Baja al guardián de la furgoneta.
   *
   * CORRECCIÓN DEL BUG de teleporte: ya NO partimos de (0,0,0) ni del spawn.
   * Tomamos la posición global ACTUAL de la furgoneta (`this.position`),
   * calculamos un vector de separación lateral seguro (2 m hacia el lado de la
   * puerta del conductor, perpendicular a la dirección de marcha) e igualamos
   * las coordenadas del jugador a ese punto contiguo ANTES de reactivar sus
   * controles y físicas. También fijamos la altura al suelo real bajo ese punto.
   */
  dismount() {
    if (this.isFootMode) return this.isFootMode;

    // Distancia lateral de separación y lado de la puerta del conductor.
    const dist = this.rangerCfg.dismountDistance ?? 2.0;
    const side = this.rangerCfg.doorSide ?? 1; // 1 = puerta del conductor

    // Vector perpendicular a la dirección de marcha (heading) hacia la puerta.
    const lateral = new THREE.Vector3(side * dist, 0, 0)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);

    // Punto contiguo a la furgoneta, NO el origen del mundo ni el spawn.
    this.rangerPosition.copy(this.position).add(lateral);

    // Altura real del suelo en ese punto (raycast con respaldo analítico).
    this.rangerPosition.y = this.terrain.getGroundHeight
      ? this.terrain.getGroundHeight(this.rangerPosition.x, this.rangerPosition.z, this.zoneId, this.position.y + 2)
      : this.terrain.getHeight(this.rangerPosition.x, this.rangerPosition.z, this.zoneId);

    // Reactivar controles/físicas del guardián con el estado bien inicializado.
    this.rangerHeading = this.heading;
    this.rangerVy = 0;
    this.rangerGrounded = true;
    this.speed = 0;
    this.steerAngle = 0;
    this.isFootMode = true;

    // Mostrar el avatar del jugador a pie.
    this.rangerGroup.visible = true;
    this._syncRangerAvatar();
    return this.isFootMode;
  }

  /** Vuelve a subir al guardián a la furgoneta (a la posición del vehículo). */
  mount() {
    if (!this.isFootMode) return this.isFootMode;
    this.isFootMode = false;
    this.rangerPosition.copy(this.position);
    this.rangerVy = 0;
    this.speed = 0;
    this.steerAngle = 0;
    this.rangerGroup.visible = false;
    return this.isFootMode;
  }

  /** Alias explícito de "bajar de la furgoneta". */
  exitVehicle() {
    return this.dismount();
  }

  /** Alterna entre conducir la furgoneta y bajarse a pie. */
  toggleFootMode() {
    return this.isFootMode ? this.mount() : this.dismount();
  }

  /** Sincroniza posición/rotación del avatar con el guardián. */
  _syncRangerAvatar() {
    if (!this.rangerAvatar) return;
    this.rangerAvatar.setTransform(
      this.rangerPosition.x,
      this.rangerPosition.y,
      this.rangerPosition.z,
      this.rangerHeading
    );
  }

  /** Aplica la animación del avatar según el estado de movimiento. */
  _animateRanger(time) {
    if (!this.rangerAvatar || !this.rangerGroup.visible) return;
    if (!this.rangerGrounded) {
      this.rangerAvatar.setMotion('jump');
    } else if (this.rangerMoving) {
      const sprinting = this.rangerSprinting;
      this.rangerAvatar.setMotion(sprinting ? 'run' : 'walk');
    } else {
      this.rangerAvatar.setMotion('idle');
    }
    this.rangerAvatar.update(1 / 60, time);
  }

  /** Posiciona la furgoneta en un punto de la zona */
  setPosition(x, z, heading = 0, zoneId = 'platja') {
    this.zoneId = zoneId;
    this.position.set(x, this.terrain.getHeight(x, z, zoneId), z);
    this.heading = heading;
    this.speed = 0;
    this.steerAngle = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    // El guardián acompaña a la furgoneta al cambiar de zona, de modo que al
    // bajarse a pie aparece junto al vehículo y no en el origen del mundo.
    this.rangerPosition.copy(this.position);
    this.rangerHeading = heading;
    this._syncRangerAvatar();
  }

  /** Actualización de la física de conducción por fotograma */
  update(delta, input, zoneId, time) {
    this.zoneId = zoneId;
    // Si estamos a pie, actualizamos el desplazamiento del guardián
    if (this.isFootMode) {
      this.updateRangerFoot(delta, input, zoneId, time);
      this.updateSirens(time);
      return;
    }

    // 1. Manejo de aceleración y frenado
    let throttle = 0;
    if (input.forward) throttle += 1;
    if (input.backward) throttle -= 1;

    let steerInput = 0;
    if (input.left) steerInput += 1;
    if (input.right) steerInput -= 1;

    // Aceleración suave
    if (throttle > 0) {
      this.speed = Math.min(this.maxSpeed, this.speed + this.accel * delta);
    } else if (throttle < 0) {
      if (this.speed > this.cfg.brakeThresholdSpeed) {
        // Frenar
        this.speed = Math.max(0, this.speed - this.brakeForce * delta);
      } else {
        // Marcha atrás
        this.speed = Math.max(
          -this.maxSpeed * this.cfg.reverseSpeedFactor,
          this.speed - this.accel * this.cfg.reverseAccelerationFactor * delta
        );
      }
    } else {
      // Rozamiento natural
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.friction * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.friction * delta);
      }
    }

    if (input.handbrake) {
      this.speed = Math.max(0, this.speed - this.brakeForce * this.cfg.handbrakeMultiplier * delta);
    }

    // 2. Dirección de ruedas y giro del vehículo
    const targetSteer = steerInput * this.maxSteer;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, delta * this.cfg.steerLerpSpeed);

    if (Math.abs(this.speed) > this.cfg.minSpeedToTurn) {
      const turnMultiplier = this.speed > 0 ? 1 : -1;
      this.heading += this.steerAngle
        * (this.speed / this.cfg.turnSpeedReference)
        * delta * turnMultiplier * this.cfg.turnRateMultiplier;
    }

    // 3. Desplazamiento en el espacio 3D con resolución de colisiones
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);

    const previousX = this.position.x;
    const previousZ = this.position.z;
    this.position.x += forwardX * this.speed * delta;
    this.position.z += forwardZ * this.speed * delta;

    // Límites de exploración del mundo
    const { boundsMin, boundsMax } = this.worldCfg;
    this.position.x = Math.max(boundsMin, Math.min(boundsMax, this.position.x));
    this.position.z = Math.max(boundsMin, Math.min(boundsMax, this.position.z));

    // 3.b Colisión contra los objetos del mundo (árboles, rocas, farolas,
    // fachadas…) y contra el agua profunda. Antes no existía y la furgoneta
    // atravesaba todo lo que encontraba por delante.
    this._resolveWorldCollisions(previousX, previousZ, forwardX, forwardZ, zoneId, delta);

    // Ajuste a la altura del terreno con suavizado de amortiguación.
    // Usamos el raycasting vertical real (getGroundHeight) y, como medida de
    // seguridad, NUNCA dejamos que la furgoneta quede por debajo de la
    // superficie: se pinza a la altura del suelo si la amortiguación no llega.
    const groundY = this.terrain.getGroundHeight
      ? this.terrain.getGroundHeight(this.position.x, this.position.z, zoneId, this.position.y + 0.5)
      : this.terrain.getHeight(this.position.x, this.position.z, zoneId);
    this.position.y += (groundY - this.position.y) * Math.min(1, delta * this.cfg.suspensionLerpSpeed);
    if (this.position.y < groundY - 0.05) this.position.y = groundY;

    /* ------------------------------------------------------------------
     * Inclinación: se muestrea la altura REAL en las cuatro ruedas (con
     * raycasting, no con la altura analítica) y se promedia. Antes se
     * comparaban sólo dos puntos a muy poca distancia, así que cualquier
     * irregularidad del relieve volcaba la furgoneta de costado.
     * ------------------------------------------------------------------ */
    this._tiltDelta = delta;
    const tilt = this._sampleTilt(zoneId, groundY);
    this.group.position.copy(this.position);
    /* Convención de signos:
     *   · rotation.x = -pitch → el morro sube cuando el terreno sube.
     *   · rotation.z = -roll  → se levanta el costado que pisa más alto
     *     (el eje local +X es el izquierdo, de ahí el signo negativo). */
    this.group.rotation.set(-tilt.pitch, this.heading, -tilt.roll, 'YXZ');

    // 4. Animación de ruedas móviles
    for (const h of this.frontWheelHolders) {
      h.rotation.y = this.steerAngle;
    }
    const wheelRoll = (this.speed * delta) / this.cfg.wheelRadius;
    for (const w of this.wheels) {
      w.rotation.x += wheelRoll;
    }

    // 5. Luces de sirena
    this.updateSirens(time);

    // 6. Audio del motor
    if (this.engineOsc && this.audioCtx) {
      const targetFreq = this.audioCfg.engineBaseFrequency + Math.abs(this.speed) * this.audioCfg.engineFrequencyPerSpeed;
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.audioCtx.currentTime, 0.1);
    }
  }

  /**
   * Resuelve el choque contra los objetos del mundo y contra el agua.
   *
   * El vehículo nunca vuelve a atravesar un obstáculo: si al avanzar entra en
   * el cilindro de un árbol, una roca o una fachada, se le expulsa por la
   * normal del contacto y su velocidad se **desliza** sobre la tangente, de
   * modo que rozar un muro no significa quedarse clavado.
   *
   * @param {number} previousX posición antes de avanzar
   * @param {number} previousZ
   * @param {number} forwardX vector dirección
   * @param {number} forwardZ
   * @param {string} zoneId
   * @param {number} delta
   */
  _resolveWorldCollisions(previousX, previousZ, forwardX, forwardZ, zoneId, delta) {
    const obstacles = this.terrain?.obstacles;
    if (!obstacles || obstacles.count === 0) {
      this._avoidWater(previousX, previousZ, zoneId);
      return;
    }

    // Detección continua: a 24 m/s un fotograma largo recorre más de un metro,
    // suficiente para “saltarse” un tronco fino. Se comprueba el segmento.
    const segment = obstacles.segmentBlocked(previousX, previousZ, this.position.x, this.position.z, this.collisionRadius);
    if (segment.blocked) {
      this.position.x = segment.x;
      this.position.z = segment.z;

      // Deslizamiento: se conserva la componente tangencial de la velocidad.
      const intoWall = forwardX * segment.nx + forwardZ * segment.nz;
      if (intoWall < 0) {
        const tangential = Math.sqrt(Math.max(0, 1 - intoWall * intoWall));
        const grip = this.cfg.impactGrip ?? 0.82;
        this.speed *= Math.max(0.05, tangential * grip);
        this.lastImpact = Math.min(1, Math.abs(intoWall));
      }
    }

    // Segunda pasada: corrige el solape residual (por ejemplo, al aparecer
    // justo encima de un obstáculo al cambiar de zona).
    const resolution = obstacles.resolveCircle(
      this.position.x,
      this.position.z,
      this.collisionRadius,
      { respectSoft: false },
    );
    if (resolution.hit) {
      this.position.x = resolution.x;
      this.position.z = resolution.z;
      const intoWall = forwardX * resolution.nx + forwardZ * resolution.nz;
      if (intoWall < 0) {
        const tangential = Math.sqrt(Math.max(0, 1 - intoWall * intoWall));
        this.speed *= Math.max(0.05, tangential * (this.cfg.impactGrip ?? 0.82));
        this.lastImpact = Math.min(1, Math.abs(intoWall));
      }
    } else if (resolution.soft && this.cfg.softDrag) {
      // Carrizos y matorral: rozan, pero no detienen al vehículo.
      this.speed -= this.speed * Math.min(1, this.cfg.softDrag * delta);
    }

    this._avoidWater(previousX, previousZ, zoneId);
  }

  /**
   * Impide meter la furgoneta en el mar, la dársena o el cauce del Serpis.
   * La barrera se ensancha con el radio del vehículo para que se detenga
   * cuando el morro toca el agua, no cuando el eje ya está dentro.
   */
  _avoidWater(previousX, previousZ, zoneId) {
    if (!this.terrain?.isFlooded) return;
    const margin = this.collisionRadius * 0.9;
    if (!this.terrain.isFlooded(this.position.x, this.position.z, zoneId, this.position.y + 2, margin)) return;

    this.position.x = previousX;
    this.position.z = previousZ;
    this.speed *= this.cfg.waterBrake ?? 0.25;
    this.lastImpact = Math.max(this.lastImpact, 0.4);
  }

  /**
   * Cabeceo y alabeo a partir de la altura real en las cuatro ruedas.
   * El resultado se interpola y se limita a `maxPitch` / `maxRoll` para que la
   * furgoneta acompañe el relieve sin llegar a volcar visualmente.
   */
  _sampleTilt(zoneId, groundY) {
    const cfg = this.cfg;
    const halfLength = (cfg.wheelBase ?? 3.2) / 2;
    const halfWidth = (cfg.trackWidth ?? 2.36) / 2;
    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);
    const sampleY = this.position.y + 1.5;

    const sample = (offsetX, offsetZ) => {
      const x = this.position.x + offsetX;
      const z = this.position.z + offsetZ;
      if (this.terrain.getGroundHeight) {
        return this.terrain.getGroundHeight(x, z, zoneId, sampleY);
      }
      return this.terrain.getHeight(x, z, zoneId);
    };

    /* Esquinas del rectángulo de apoyo en coordenadas de mundo.
     *
     * Ojo con la orientación: con el morro en +Z, el eje local +X de la
     * furgoneta es su costado IZQUIERDO (derecha = adelante × arriba). El
     * código anterior muestreaba el lado contrario y el vehículo se tumbaba
     * hacia fuera de la pendiente en vez de apoyarse en ella. */
    const rightX = -cos;
    const rightZ = sin;

    const frontRight = sample(sin * halfLength + rightX * halfWidth, cos * halfLength + rightZ * halfWidth);
    const frontLeft = sample(sin * halfLength - rightX * halfWidth, cos * halfLength - rightZ * halfWidth);
    const rearRight = sample(-sin * halfLength + rightX * halfWidth, -cos * halfLength + rightZ * halfWidth);
    const rearLeft = sample(-sin * halfLength - rightX * halfWidth, -cos * halfLength - rightZ * halfWidth);

    const front = (frontLeft + frontRight) / 2;
    const rear = (rearLeft + rearRight) / 2;
    const right = (frontRight + rearRight) / 2;
    const left = (frontLeft + rearLeft) / 2;

    const reference = (front + rear + left + right) / 4;
    let pitch = Math.atan2(front - rear, halfLength * 2);
    let roll = Math.atan2(right - left, halfWidth * 2);

    // La inclinación se mide sobre el apoyo real, pero si el vehículo está en
    // el aire (o el rayo falla) se suaviza hacia la referencia del suelo.
    if (!Number.isFinite(pitch)) pitch = 0;
    if (!Number.isFinite(roll)) roll = 0;

    const maxPitch = cfg.maxPitch ?? 0.42;
    const maxRoll = cfg.maxRoll ?? 0.3;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    roll = Math.max(-maxRoll, Math.min(maxRoll, roll));

    // Suavizado: la suspensión no responde de golpe a cada piedra.
    const lerp = Math.min(1, (cfg.tiltLerpSpeed ?? 6) * (this._tiltDelta ?? 1 / 60));
    this.smoothPitch += (pitch - this.smoothPitch) * lerp;
    this.smoothRoll += (roll - this.smoothRoll) * lerp;
    this._groundReference = reference || groundY;

    return { pitch: this.smoothPitch, roll: this.smoothRoll };
  }

  /** Actualización del movimiento del guardián a pie */
  updateRangerFoot(delta, input, zoneId, time) {
    const cfg = this.rangerCfg;
    const walkSpeed = input.handbrake ? cfg.sprintSpeed : cfg.walkSpeed;

    let forward = 0;
    if (input.forward) forward += 1;
    if (input.backward) forward -= 1;
    let turn = 0;
    if (input.left) turn += 1;
    if (input.right) turn -= 1;

    this.rangerHeading += turn * cfg.turnSpeed * delta;

    const moving = forward !== 0;
    if (moving) {
      this.rangerPosition.x += Math.sin(this.rangerHeading) * forward * walkSpeed * delta;
      this.rangerPosition.z += Math.cos(this.rangerHeading) * forward * walkSpeed * delta;
    }

    // Límites del mundo
    const { boundsMin: rMin, boundsMax: rMax } = this.worldCfg;
    this.rangerPosition.x = Math.max(rMin, Math.min(rMax, this.rangerPosition.x));
    this.rangerPosition.z = Math.max(rMin, Math.min(rMax, this.rangerPosition.z));

    // Colisión horizontal: el guardián tampoco atraviesa árboles ni muros.
    const obstacles = this.terrain?.obstacles;
    if (obstacles && obstacles.count > 0 && moving) {
      const resolution = obstacles.resolveCircle(
        this.rangerPosition.x,
        this.rangerPosition.z,
        this.rangerCollisionRadius,
        { respectSoft: false },
      );
      if (resolution.hit) {
        this.rangerPosition.x = resolution.x;
        this.rangerPosition.z = resolution.z;
      }
    }

    // ---------- Colisión vertical: raycasting + CCD ----------
    // Salto (flanco de entrada) sólo si estamos sobre el suelo.
    if (input.jump && this.rangerGrounded) {
      this.rangerVy = cfg.jumpForce;
      this.rangerGrounded = false;
    }

    // Resolvemos la altura real del suelo con raycast vertical (con respaldo
    // analítico) para NUNCA caer por debajo de la superficie.
    const groundResolver = (x, z, fromY) =>
      this.terrain.getGroundHeight
        ? this.terrain.getGroundHeight(x, z, zoneId, fromY)
        : this.terrain.getHeight(x, z, zoneId);

    if (this.rangerGrounded) {
      // Pie en el suelo: fijamos a la altura real del terreno (anti hundimiento).
      this.rangerPosition.y = groundResolver(this.rangerPosition.x, this.rangerPosition.z, this.rangerPosition.y + 0.5);
    } else {
      // Caída/salto con Detección Continua de Colisiones para evitar tunneling.
      const result = this.terrain.collider?.integrateVertical
        ? this.terrain.collider.integrateVertical(
            { x: this.rangerPosition.x, z: this.rangerPosition.z },
            this.rangerPosition.y,
            this.rangerVy,
            delta,
            { gravity: cfg.gravity, maxFallSpeed: cfg.maxFallSpeed },
            groundResolver
          )
        : this._integrateVerticalFallback(
            { x: this.rangerPosition.x, z: this.rangerPosition.z },
            this.rangerPosition.y,
            this.rangerVy,
            delta,
            cfg,
            groundResolver
          );
      this.rangerPosition.y = result.y;
      this.rangerVy = result.vy;
      this.rangerGrounded = result.grounded;
    }

    // Velocidad del guardián (independiente de la furgoneta, que permanece 0
    // mientras vamos a pie). Se usa para animaciones y el HUD a pie.
    this.rangerSpeed = moving ? Math.abs(forward) * (input.handbrake ? cfg.sprintSpeed : cfg.walkSpeed) : 0;
    this.speed = 0;
    this.rangerSprinting = !!input.handbrake && moving;
    this.rangerMoving = moving;

    // Posicionar y animar el avatar a pie.
    this._syncRangerAvatar();
    this._animateRanger(time);
  }

  /** Respaldo de integración vertical (cuando no hay GroundCollider disponible). */
  _integrateVerticalFallback(posXZ, y, vy, delta, cfg, groundResolver) {
    let currentY = y;
    let currentVy = vy;
    currentVy = Math.max(cfg.maxFallSpeed, currentVy + cfg.gravity * delta);
    currentY += currentVy * delta;
    const ground = groundResolver(posXZ.x, posXZ.z, currentY + 0.5);
    if (currentY <= ground) {
      return { y: ground, vy: 0, grounded: true };
    }
    return { y: currentY, vy: currentVy, grounded: false };
  }

  /** Efecto pulsante de las luces de emergencia */
  updateSirens(time) {
    if (!this.sirenActive) {
      for (const s of this.sirenLights) {
        s.light.intensity = 0;
        s.blue.material.emissiveIntensity = 0.2;
        s.amber.material.emissiveIntensity = 0.2;
      }
      return;
    }

    const flash = Math.sin(time * this.audioCfg.sirenFlashHz) > 0;
    for (const s of this.sirenLights) {
      s.light.intensity = flash ? 3.5 : 0.8;
      s.light.color.setHex(flash ? 0x00b4d8 : 0xffb703);
      s.blue.material.emissiveIntensity = flash ? 3 : 0.4;
      s.amber.material.emissiveIntensity = flash ? 0.4 : 3;
    }
  }

  /** Posicionamiento de la cámara según el modo seleccionado */
  updateCamera(camera, delta) {
    if (this.isFootMode) {
      // Cámara en tercera persona sobre el guardián
      const foot = this.cameraCfg.foot;
      const camOffset = new THREE.Vector3(
        -Math.sin(this.rangerHeading) * foot.distance,
        foot.height,
        -Math.cos(this.rangerHeading) * foot.distance
      );
      const targetPos = this.rangerPosition.clone().add(camOffset);
      camera.position.lerp(targetPos, Math.min(1, delta * foot.lerpSpeed));
      camera.lookAt(this.rangerPosition.x, this.rangerPosition.y + foot.lookAtHeight, this.rangerPosition.z);
      return;
    }

    if (this.cameraMode === 'chase') {
      // Tercera persona detrás de la furgoneta
      const chase = this.cameraCfg.chase;
      const camDist = chase.distance;
      const camHeight = chase.height;
      const fwdX = Math.sin(this.heading);
      const fwdZ = Math.cos(this.heading);

      const targetPos = new THREE.Vector3(
        this.position.x - fwdX * camDist,
        this.position.y + camHeight,
        this.position.z - fwdZ * camDist
      );

      camera.position.lerp(targetPos, Math.min(1, delta * chase.lerpSpeed));
      camera.lookAt(this.position.x, this.position.y + chase.lookAtHeight, this.position.z);
    } else if (this.cameraMode === 'hood') {
      // Primera persona / Capó
      const hood = this.cameraCfg.hood;
      const hoodOffset = new THREE.Vector3(...hood.offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
      const lookOffset = new THREE.Vector3(...hood.lookOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);

      camera.position.copy(this.position).add(hoodOffset);
      camera.lookAt(this.position.clone().add(lookOffset));
    } else if (this.cameraMode === 'top') {
      // Vista táctil cenital de rescate
      const top = this.cameraCfg.top;
      const targetPos = new THREE.Vector3(this.position.x, this.position.y + top.height, this.position.z);
      camera.position.lerp(targetPos, Math.min(1, delta * top.lerpSpeed));
      camera.lookAt(this.position.x, this.position.y, this.position.z);
    }
  }

  /** Devuelve la posición activa para interacciones (furgoneta o ranger) */
  getActivePosition() {
    return this.isFootMode ? this.rangerPosition : this.position;
  }

  /** Limpieza de audio y recursos */
  dispose() {
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch (e) { /* noop */ }
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) { /* noop */ }
    }
  }
}
