import * as THREE from 'three';
import { AnimatedModel } from './AnimatedModel.js';
import { loadModel } from './ModelLoader.js';

/**
 * AnimatedEntity — entidad que puede representarse con un modelo 3D detallado
 * (GLTF + AnimationMixer) o, si éste no está disponible, con un monigote de
 * primitivas de respaldo. Encapsula el ciclo "cargar modelo → animar" para que
 * humanos y animales del juego compartan la misma estructura.
 *
 * Uso:
 *   const npc = new AnimatedEntity({
 *     path: 'models/npc.glb',
 *     animations: { idle: 'Idle', walk: 'Walk' },
 *     buildFallback: () => buildHumanoidMesh(outfit),
 *     motion: 'idle',
 *   });
 *   scene.add(npc.root);
 *   // en cada frame:
 *   npc.setMotion('walk');
 *   npc.update(delta, time);
 */
export class AnimatedEntity {
  constructor({
    path = null,
    animations = {},
    buildFallback = null,
    motion = 'idle',
    scale = 1,
  } = {}) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.model = null;   // AnimatedModel (si hay glTF con animaciones)
    this.fallback = null; // Object3D de primitivas (respaldo)
    this.motion = motion;
    this._fallbackPhase = 0;

    // 1. Monigote de respaldo: se usa hasta que llegue el modelo real.
    if (typeof buildFallback === 'function') {
      this.fallback = buildFallback();
      if (this.fallback) this.root.add(this.fallback);
    }

    // 2. Carga asíncrona del modelo GLTF detallado.
    if (path) this._loadModel(path, animations);
  }

  async _loadModel(path, animations) {
    await this.setModelSource(path, animations);
  }

  /**
   * Carga (o intercambia) el modelo GLTF de la entidad en caliente,
   * reemplazando el monigote de respaldo cuando el modelo llega.
   * @param {string} path Ruta del `.glb` / `.gltf`.
   * @param {object} [animations] Mapa estado → nombre de clip.
   */
  async setModelSource(path, animations = {}) {
    const gltf = await loadModel(path);
    if (!gltf) return; // mantiene el monigote de respaldo
    if (gltf.animations?.length) {
      this.model = new AnimatedModel(gltf, { animations });
      this.root.add(this.model.root);
      this._applyMotion(this.motion);
    } else {
      // Modelo estático sin animaciones: lo usamos igualmente.
      const staticRoot = gltf.scene;
      this.root.add(staticRoot);
    }
    // Reemplazamos el monigote por el modelo detallado.
    if (this.fallback) {
      this.root.remove(this.fallback);
      this.fallback = null;
    }
  }

  /** Cambia el estado de movimiento (idle/walk/run/jump…). */
  setMotion(name) {
    this.motion = name;
    this._applyMotion(name);
  }

  _applyMotion(name) {
    this.model?.playMotion(name);
  }

  /**
   * Avanza animaciones y animación procedural de respaldo.
   * @param {number} delta
   * @param {number} time Tiempo global para el respaldo.
   */
  update(delta, time = 0) {
    if (this.model) {
      this.model.update(delta);
      return;
    }
    // Respaldo sin mixer: respiración/balanceo para que no parezca una estatua.
    if (this.fallback) {
      this._fallbackPhase += delta;
      const breathe = Math.sin(this._fallbackPhase * 2.2) * 0.02;
      this.fallback.scale.set(1, 1 + breathe, 1);
    }
  }

  /** Orientación y posición de la entidad. */
  setTransform(x, y, z, heading = 0) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = heading;
  }

  /** Libera recursos (los mixers del modelo). */
  dispose() {
    this.model?.mixer?.stopAllAction();
  }
}
