import * as THREE from 'three';
import { createRescueVanDecal } from './TextureFactory.js';
import { DEFAULT_PLAYER_STATS } from '../engine/defaults.js';

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
    this.rangerPosition = new THREE.Vector3(0, 0, 0);
    this.rangerHeading = 0;

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

  /** Alterna entre conducir la furgoneta y bajarse a pie */
  toggleFootMode() {
    this.isFootMode = !this.isFootMode;
    if (this.isFootMode) {
      // Posicionar al guardián junto a la puerta de la furgoneta
      const offset = new THREE.Vector3(2.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
      this.rangerPosition.copy(this.position).add(offset);
      this.rangerHeading = this.heading;
      this.speed = 0;
    }
    return this.isFootMode;
  }

  /** Posiciona la furgoneta en un punto de la zona */
  setPosition(x, z, heading = 0, zoneId = 'platja') {
    this.position.set(x, this.terrain.getHeight(x, z, zoneId), z);
    this.heading = heading;
    this.speed = 0;
    this.steerAngle = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }

  /** Actualización de la física de conducción por fotograma */
  update(delta, input, zoneId, time) {
    // Si estamos a pie, actualizamos el desplazamiento del guardián
    if (this.isFootMode) {
      this.updateRangerFoot(delta, input, zoneId);
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

    // 3. Desplazamiento en el espacio 3D
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);

    this.position.x += forwardX * this.speed * delta;
    this.position.z += forwardZ * this.speed * delta;

    // Límites de exploración del mundo
    const { boundsMin, boundsMax } = this.worldCfg;
    this.position.x = Math.max(boundsMin, Math.min(boundsMax, this.position.x));
    this.position.z = Math.max(boundsMin, Math.min(boundsMax, this.position.z));

    // Ajuste a la altura del terreno con suavizado de amortiguación
    const groundY = this.terrain.getHeight(this.position.x, this.position.z, zoneId);
    this.position.y += (groundY - this.position.y) * Math.min(1, delta * this.cfg.suspensionLerpSpeed);

    // Inclinación de cabeceo y alabeo según la pendiente del terreno
    const pitchDist = this.cfg.pitchSampleDistance;
    const aheadX = this.position.x + forwardX * pitchDist;
    const aheadZ = this.position.z + forwardZ * pitchDist;
    const aheadY = this.terrain.getHeight(aheadX, aheadZ, zoneId);
    const pitch = Math.atan2(aheadY - groundY, pitchDist);

    const rollDist = this.cfg.rollSampleDistance;
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    const rY = this.terrain.getHeight(this.position.x + rightX * rollDist, this.position.z + rightZ * rollDist, zoneId);
    const lY = this.terrain.getHeight(this.position.x - rightX * rollDist, this.position.z - rightZ * rollDist, zoneId);
    const roll = Math.atan2(rY - lY, rollDist * 2);

    this.group.position.copy(this.position);
    this.group.rotation.set(-pitch, this.heading, -roll, 'YXZ');

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

  /** Actualización del movimiento del guardián a pie */
  updateRangerFoot(delta, input, zoneId) {
    const walkSpeed = input.handbrake ? this.rangerCfg.sprintSpeed : this.rangerCfg.walkSpeed;
    let forward = 0;
    if (input.forward) forward += 1;
    if (input.backward) forward -= 1;
    let turn = 0;
    if (input.left) turn += 1;
    if (input.right) turn -= 1;

    this.rangerHeading += turn * this.rangerCfg.turnSpeed * delta;

    if (forward !== 0) {
      this.rangerPosition.x += Math.sin(this.rangerHeading) * forward * walkSpeed * delta;
      this.rangerPosition.z += Math.cos(this.rangerHeading) * forward * walkSpeed * delta;
    }

    const { boundsMin: rMin, boundsMax: rMax } = this.worldCfg;
    this.rangerPosition.x = Math.max(rMin, Math.min(rMax, this.rangerPosition.x));
    this.rangerPosition.z = Math.max(rMin, Math.min(rMax, this.rangerPosition.z));
    this.rangerPosition.y = this.terrain.getHeight(this.rangerPosition.x, this.rangerPosition.z, zoneId);
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
