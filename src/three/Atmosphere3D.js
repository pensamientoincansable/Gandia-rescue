import * as THREE from 'three';
import { DAY_CYCLE, dayCycleIndex } from './WorldAssets.js';
import { createEnvironmentCubeTexture, createPanoramaTexture } from './TextureFactory.js';

/**
 * Gestor de atmósfera, iluminación y cielo para la simulación 3D de Gandía.
 *
 * **Ciclo día/noche real** con los cielos fotográficos del repositorio:
 *  · Cúpula con el panorama equirrectangular de la fase (`Panorama_Sky_NN`).
 *  · Iluminación de entorno PBR con el cubemap de la fase (`Cubemap_Sky_NN`).
 *  · Sol y luna con trayectoria real: la luz direccional gira y cambia de
 *    color e intensidad según la altura solar de la fase.
 *  · Estrellas visibles de noche, niebla y luces ambientales por fase.
 *
 * Las transiciones entre fases se interpolan (mezcla de panoramas mediante una
 * cúpula secundaria con opacidad creciente), de modo que el cambio de hora se
 * ve continuo. `setPhase(id)` fija una fase; `setCycleEnabled(bool)` activa el
 * avance automático; `advancePhase()` salta a la siguiente.
 */

const HALF_PI = Math.PI / 2;

/** Colores de las luces por familia de fase (noche, crepúsculo, día). */
const LIGHT_PROFILE = {
  night: { sun: 0x8fa8d8, hemiSky: 0x2a3355, hemiGround: 0x141821, ambient: 0x323a4d, fogDensity: 1.35 },
  twilight: { sun: 0xffb27a, hemiSky: 0x8a7d9e, hemiGround: 0x4a4340, ambient: 0x8d8496, fogDensity: 1.1 },
  golden: { sun: 0xffd9a0, hemiSky: 0xc9d2e0, hemiGround: 0x8a7a5e, ambient: 0xd8cbb4, fogDensity: 1 },
  day: { sun: 0xfff4dd, hemiSky: 0xbfdcec, hemiGround: 0x9a8f78, ambient: 0xdbe7e4, fogDensity: 1 },
};

function lightProfileForSunHeight(sun) {
  if (sun <= 0.04) return LIGHT_PROFILE.night;
  if (sun <= 0.16) return LIGHT_PROFILE.twilight;
  if (sun <= 0.45) return LIGHT_PROFILE.golden;
  return LIGHT_PROFILE.day;
}

export class Atmosphere3D {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.ambientLight = null;
    this.hemiLight = null;
    this.sunLight = null;
    this.moonLight = null;
    this.skyDome = null;
    this.skyDomeNext = null;
    this.stars = null;
    this.cloudMeshes = [];

    // Estado del ciclo: fase actual, fase destino (transición) y progreso.
    this.phaseIndex = dayCycleIndex('mediodia');
    this.transitionFrom = this.phaseIndex;
    this.transitionProgress = 1;
    this.cycleEnabled = false;
    this.cycleSecondsPerPhase = 45;

    // La zona puede desplazar la hora local (costa: más atardeceres).
    this.zonePhaseOffset = 0;

    this.setupLighting();
    this.setupSkyDome();
    this.setupStars();
    this.setupClouds();
    this.applyPhase(this.phaseIndex, 1);
  }

  /* ------------------------------------------------------------------ luces */

  setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xdbe7e4, 0.65);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x7ec8e3, 0x8a7e68, 0.55);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    this.sunLight.position.set(60, 90, 50);
    this.sunLight.castShadow = true;
    if (this.sunLight.shadow && this.sunLight.shadow.mapSize) {
      this.sunLight.shadow.mapSize.width = 1024;
      this.sunLight.shadow.mapSize.height = 1024;
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 280;
      this.sunLight.shadow.camera.left = -90;
      this.sunLight.shadow.camera.right = 90;
      this.sunLight.shadow.camera.top = 90;
      this.sunLight.shadow.camera.bottom = -90;
    }
    this.scene.add(this.sunLight);

    // Luna: luz direccional fría y tenue para que la noche siga siendo legible.
    this.moonLight = new THREE.DirectionalLight(0xa8c0e8, 0);
    this.moonLight.position.set(-50, 70, -40);
    this.scene.add(this.moonLight);
  }

  /* ----------------------------------------------------------- cúpula celestial */

  setupSkyDome() {
    const skyGeo = new THREE.SphereGeometry(240, 32, 20);
    skyGeo.scale(-1, 1, 1);

    // Cúpula principal: panorama equirrectangular de la fase activa.
    const texture = createPanoramaTexture('mediodia');
    this.skyTexture = texture;

    const skyMat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      dithering: true,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(this.skyDome);

    // Cúpula secundaria para fundir entre fases sin parpadeos.
    const nextMat = skyMat.clone();
    nextMat.transparent = true;
    nextMat.opacity = 0;
    this.skyDomeNext = new THREE.Mesh(skyGeo.clone(), nextMat);
    this.skyDomeNext.renderOrder = -1;
    this.group.add(this.skyDomeNext);

    this.scene.fog = new THREE.FogExp2(0xaad8e6, 0.0035);
  }

  /** Campo de estrellas (puntos) visible sólo de noche. */
  setupStars() {
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      // Distribución hemisférica sobre el horizonte.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.92);
      const r = 225;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 5;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geometry, material);
    this.group.add(this.stars);
  }

  setupClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    });

    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();
      const numPuffs = 4 + Math.floor(Math.random() * 4);
      for (let p = 0; p < numPuffs; p++) {
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + Math.random() * 6, 1), cloudMat);
        puff.position.set((p - numPuffs / 2) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5);
        group.add(puff);
      }

      const angle = (i / 12) * Math.PI * 2;
      const dist = 70 + Math.random() * 80;
      group.position.set(Math.cos(angle) * dist, 55 + (i % 3) * 8, Math.sin(angle) * dist);
      this.group.add(group);
      this.cloudMeshes.push(group);
    }
  }

  /* -------------------------------------------------------------- ciclo día/noche */

  /** Identificador de la fase activa. */
  get phaseId() {
    return DAY_CYCLE[this.phaseIndex]?.id ?? 'mediodia';
  }

  /** Lista de fases (para HUD). */
  static get phases() {
    return DAY_CYCLE.map((p) => p.id);
  }

  /**
   * Fija la fase destino. La mezcla con la actual dura `duration` segundos;
   * con duration 0 el cambio es inmediato.
   */
  setPhase(phaseId, duration = 2.2) {
    const index = dayCycleIndex(phaseId);
    if (index === this.phaseIndex && this.transitionProgress >= 1) return;
    this.transitionFrom = this.phaseIndex;
    this.phaseIndex = index;
    if (duration > 0) {
      this.transitionProgress = 0;
      this.startBlend(duration);
    } else {
      this.transitionProgress = 1;
      this.applyPhase(index, 1);
    }
  }

  /** Salta a la siguiente fase del ciclo (ciclo de 10). */
  advancePhase(duration = 2.2) {
    const next = (this.phaseIndex + 1) % DAY_CYCLE.length;
    this.setPhase(DAY_CYCLE[next].id, duration);
    return DAY_CYCLE[next].id;
  }

  /** Activa/desactiva el avance automático del ciclo. */
  setCycleEnabled(enabled) {
    this.cycleEnabled = Boolean(enabled);
  }

  /**
   * Ajusta la hora mostrada sin recolocar luces de la zona. `offset` es un
   * índice de fase que se suma al elegir la fase por defecto de cada zona.
   */
  setZonePhaseOffset(offset) {
    this.zonePhaseOffset = ((offset % DAY_CYCLE.length) + DAY_CYCLE.length) % DAY_CYCLE.length;
  }

  /** Comienza la fundido entre la cúpula actual y la de la fase destino. */
  startBlend(duration) {
    const nextPhase = DAY_CYCLE[this.phaseIndex];
    const texture = createPanoramaTexture(nextPhase.id);
    if (this.skyDomeNext?.material) {
      this.skyDomeNext.material.map = texture;
      this.skyDomeNext.material.needsUpdate = true;
      this.skyDomeNext.material.opacity = 0;
    }
    this.skyTextureNext = texture;
    this._transitionDuration = Math.max(0.0001, duration);
  }

  /**
   * Aplica una fase al cielo y a las luces. `blend` [0..1] mezcla desde la
   * fase previa durante las transiciones.
   */
  applyPhase(index, blend = 1) {
    const phase = DAY_CYCLE[index] ?? DAY_CYCLE[5];
    const from = DAY_CYCLE[this.transitionFrom] ?? phase;
    const profile = lightProfileForSunHeight(phase.sun);
    const profileFrom = lightProfileForSunHeight(from.sun);
    const mix = (a, b) => a + (b - a) * blend;

    // Cielo: la cúpula base muestra la fase origen y la secundaria funde encima.
    if (blend >= 1) {
      if (this.skyDome?.material) {
        this.skyDome.material.map = createPanoramaTexture(phase.id);
        this.skyDome.material.needsUpdate = true;
      }
      if (this.skyDomeNext?.material) this.skyDomeNext.material.opacity = 0;
      this.skyTexture = this.skyDome?.material?.map ?? this.skyTexture;
    } else if (this.skyDomeNext?.material) {
      this.skyDomeNext.material.opacity = blend;
    }

    // Entorno PBR: cubemap de la fase. Se asigna sólo cuando las 6 caras han
    // cargado (createEnvironmentCubeTexture entrega vía onLoad) y si la fase
    // sigue siendo la activa cuando termina la descarga.
    if (this._envAppliedFor !== phase.id) {
      this._envAppliedFor = phase.id;
      createEnvironmentCubeTexture(phase.id, (cube) => {
        if (DAY_CYCLE[this.phaseIndex]?.id === phase.id) this.scene.environment = cube;
      });
    }

    // Sol: trayectoria este-oeste modulada por la altura de la fase.
    const azimuth = Math.PI * (0.28 + 0.44 * index / (DAY_CYCLE.length - 1));
    const elevation = Math.max(0.06, phase.sun) * HALF_PI;
    const radius = 150;
    this.sunLight.position.set(
      Math.cos(azimuth) * radius * Math.cos(elevation),
      Math.sin(elevation) * radius,
      Math.sin(azimuth) * radius * Math.cos(elevation),
    );
    this.sunLight.intensity = mix(0.05, 0.35 + 1.25 * phase.sun, blend) * (phase.sun > 0.02 ? 1 : 0);
    this.sunLight.color.setHex(phase.sun > 0.45 ? 0xfff4dd : profile.sun);

    // Luna: brilla sólo cuando el sol está bajo.
    this.moonLight.intensity = mix(this.moonLight.intensity, phase.sun <= 0.04 ? 0.32 : 0, blend);

    // Ambiente, hemisférica y niebla.
    this.ambientLight.color.lerpColors(new THREE.Color(profileFrom.ambient), new THREE.Color(profile.ambient), blend);
    this.ambientLight.intensity = mix(0.18, 0.34 + 0.34 * phase.sun, blend);
    this.hemiLight.color.lerpColors(new THREE.Color(profileFrom.hemiSky), new THREE.Color(profile.hemiSky), blend);
    this.hemiLight.groundColor.lerpColors(new THREE.Color(profileFrom.hemiGround), new THREE.Color(profile.hemiGround), blend);
    this.hemiLight.intensity = mix(0.2, 0.3 + 0.32 * phase.sun, blend);

    if (this.scene.fog) {
      this.scene.fog.color.lerpColors(new THREE.Color(from.fog), new THREE.Color(phase.fog), blend);
    }
    this._baseFogDensity = this._zoneFogDensity ? this._zoneFogDensity * profile.fogDensity : 0.0035 * profile.fogDensity;
    if (this.scene.fog && blend >= 1) this.scene.fog.density = this._baseFogDensity;

    // Estrellas y nubes.
    if (this.stars?.material) this.stars.material.opacity = mix(this.stars.material.opacity, phase.sun <= 0.05 ? 0.9 : 0, blend);
    if (this.cloudMeshes.length) {
      const cloud = this.cloudMeshes[0]?.children?.[0]?.material;
      if (cloud) cloud.opacity = mix(0.85, phase.sun <= 0.05 ? 0.32 : 0.85, blend);
      if (cloud) cloud.color.setHex(phase.sun <= 0.05 ? 0x9aa4c8 : (phase.sun <= 0.2 ? 0xd8b8a8 : 0xffffff));
    }
  }

  /* -------------------------------------------------------------- zona */

  setZoneAtmosphere(zoneId) {
    if (!this.scene.fog || !this.sunLight) return;

    // Cada zona entra con su fase característica (respetando el offset del
    // ciclo manual): costa al atardecer, sierra al mediodía, marjal al alba…
    const zonePhase = {
      platja: 'tarde',
      port: 'manana',
      marjal: 'alba',
      riu: 'manana',
      casc: 'atardecer',
      montduver: 'mediodia',
    }[zoneId] ?? 'mediodia';

    if (!this.cycleEnabled) {
      const target = (dayCycleIndex(zonePhase) + this.zonePhaseOffset) % DAY_CYCLE.length;
      if (this.transitionProgress >= 1 && target !== this.phaseIndex) {
        this.transitionFrom = this.phaseIndex;
        this.phaseIndex = target;
        this.transitionProgress = 0;
        this.startBlend(1.6);
      }
    }

    // Niebla base por zona (la fase la modula en applyPhase).
    const zoneFogDensity = {
      platja: 0.003, port: 0.0035, marjal: 0.0045, riu: 0.004, casc: 0.0035, montduver: 0.0022,
    }[zoneId] ?? 0.0035;
    this._zoneFogDensity = zoneFogDensity;

    const phase = DAY_CYCLE[this.phaseIndex] ?? DAY_CYCLE[5];
    const profile = lightProfileForSunHeight(phase.sun);
    this._baseFogDensity = zoneFogDensity * profile.fogDensity;
    this.scene.fog.density = this._baseFogDensity;
  }

  /* -------------------------------------------------------------- frame */

  update(delta, time) {
    // Avance automático del ciclo.
    if (this.cycleEnabled && this.transitionProgress >= 1) {
      this._cycleAccum = (this._cycleAccum ?? 0) + delta;
      if (this._cycleAccum >= this.cycleSecondsPerPhase) {
        this._cycleAccum = 0;
        this.advancePhase(3);
      }
    }

    // Progreso de la transición entre fases.
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + delta / this._transitionDuration);
      const eased = this.transitionProgress * this.transitionProgress * (3 - 2 * this.transitionProgress);
      this.applyPhase(this.phaseIndex, eased);
      if (this.transitionProgress >= 1 && this.scene.fog) {
        this.scene.fog.density = this._baseFogDensity ?? this.scene.fog.density;
      }
    }

    // Deriva lenta de nubes.
    for (let i = 0; i < this.cloudMeshes.length; i++) {
      const c = this.cloudMeshes[i];
      c.position.x += Math.sin(time * 0.02 + i) * 0.04;
      c.position.z += Math.cos(time * 0.02 + i) * 0.04;
    }

    // Parpadeo tenue de las estrellas.
    if (this.stars?.material && this.stars.material.opacity > 0.01) {
      this.stars.material.opacity = 0.82 + Math.sin(time * 1.7) * 0.08;
    }
  }
}
