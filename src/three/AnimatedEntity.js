import * as THREE from 'three';
import { AnimatedModel } from './AnimatedModel.js';
import { createFittedHolder } from './ModelFitter.js';
import { loadModel, normalizeModelPaths } from './ModelLoader.js';

/**
 * AnimatedEntity — entidad que puede representarse con un modelo 3D detallado
 * (GLTF + AnimationMixer) o, si éste no está disponible, con un monigote de
 * primitivas de respaldo. Encapsula el ciclo "cargar modelo → animar" para que
 * humanos y animales del juego compartan la misma estructura.
 *
 * Tres mejoras pensadas para poder enchufar assets externos (p. ej. un modelo
 * generado con IA en SupaVoxel) sin tocar el resto del motor:
 *   · `paths`: cadena de candidatas probadas en orden (copia local → URL remota
 *     → asset procedural del repositorio). La primera que carga gana.
 *   · `fit`: normaliza escala/orientación del asset a las medidas del juego
 *     (1.85 m, pies en y=0, centrado, mirando a +Z). Ver `ModelFitter.js`.
 *   · animación procedural: si el `.glb` no trae clips (lo habitual en modelos
 *     generados con IA), la entidad no se queda congelada: reproduce un
 *     balanceo/rebote coherente con el estado (reposo, caminar, correr, saltar).
 *
 * Uso:
 *   const npc = new AnimatedEntity({
 *     paths: ['models/npc.glb'],
 *     animations: { idle: 'Idle', walk: 'Walk' },
 *     buildFallback: () => buildHumanoidMesh(outfit),
 *     motion: 'idle',
 *   });
 *   scene.add(npc.root);
 *   // en cada frame:
 *   npc.setMotion('walk');
 *   npc.update(delta, time);
 */

/** Parámetros del balanceo procedural por estado (sin clips de animación). */
const PROCEDURAL_MOTIONS = {
  idle: { bob: 0.012, freq: 1.5, lean: 0.0, sway: 0.012 },
  walk: { bob: 0.034, freq: 3.4, lean: 0.06, sway: 0.05 },
  run: { bob: 0.058, freq: 5.0, lean: 0.14, sway: 0.08 },
  sprint: { bob: 0.058, freq: 5.0, lean: 0.14, sway: 0.08 },
  jump: { bob: 0.0, freq: 1.0, lean: 0.09, sway: 0.0 },
  talk: { bob: 0.016, freq: 2.0, lean: 0.02, sway: 0.03 },
  fly: { bob: 0.05, freq: 2.4, lean: 0.0, sway: 0.04 },
};

export class AnimatedEntity {
  constructor({
    path = null,
    paths = null,
    animations = {},
    buildFallback = null,
    motion = 'idle',
    scale = 1,
    fit = null,
    procedural = true,
    label = 'entity',
    onModel = null,
  } = {}) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    // Pivote intermedio: aquí vive la animación procedural; `root` sólo recibe
    // posición y orientación del motor, así nunca se pisan entre sí.
    this.visual = new THREE.Group();
    this.visual.name = `${label}Visual`;
    this.root.add(this.visual);

    this.model = null;        // AnimatedModel (si el glTF trae clips)
    this.modelHolder = null;  // objeto añadido a `visual` (ajustado o en crudo)
    this.fallback = null;     // Object3D de primitivas (respaldo)
    this.motion = motion;
    this.paths = normalizeModelPaths(paths ?? path);
    this.animations = animations ?? {};
    this.fit = fit ?? null;
    this.procedural = procedural;
    this.label = label;
    this.source = null;       // ruta/URL del modelo realmente cargado
    this.onModel = typeof onModel === 'function' ? onModel : null;

    // Estado de la animación procedural
    this._phase = 0;
    this._bob = 0;
    this._lean = 0;
    this._sway = 0;

    // 1. Monigote de respaldo: se usa hasta que llegue el modelo real.
    if (typeof buildFallback === 'function') {
      this.fallback = buildFallback();
      if (this.fallback) this.visual.add(this.fallback);
    }

    // 2. Carga asíncrona del modelo GLTF detallado (cadena de candidatas).
    if (this.paths.length) this.setModelSources(this.paths, animations, { fit });
  }

  /** ¿Hay ya un modelo GLTF en escena (en lugar del monigote)? */
  get hasModel() {
    return !!this.modelHolder;
  }

  /** ¿El modelo cargado trae clips de animación propios? */
  get isAnimated() {
    return !!this.model;
  }

  async _loadModel(path, animations) {
    await this.setModelSources([path], animations);
  }

  /**
   * Carga (o intercambia) el modelo GLTF de la entidad en caliente.
   * Se conserva por compatibilidad con NPCs3D/Fauna3D.
   * @param {string} path Ruta del `.glb` / `.gltf`.
   * @param {object} [animations] Mapa estado → nombre de clip.
   * @param {{ fit?: object }} [options]
   */
  async setModelSource(path, animations = {}, options = {}) {
    return this.setModelSources([path], animations, options);
  }

  /**
   * Prueba varias candidatas en orden y usa la primera que cargue.
   * @param {string|string[]} paths
   * @param {object} [animations] Mapa estado → nombre de clip.
   * @param {{ fit?: object|null }} [options]
   * @returns {Promise<{ loaded: boolean, path: string|null, animated: boolean }>}
   */
  async setModelSources(paths, animations = {}, options = {}) {
    const candidates = normalizeModelPaths(paths);
    if (candidates.length) this.paths = candidates;
    if (animations && Object.keys(animations).length) this.animations = animations;
    const fit = options.fit !== undefined ? options.fit : this.fit;
    if (fit !== undefined && fit !== null) this.fit = fit;

    for (const candidate of candidates) {
      const gltf = await loadModel(candidate); // eslint-disable-line no-await-in-loop
      if (!gltf) continue;
      this._attachModel(gltf, this.animations, this.fit, candidate);
      return { loaded: true, path: candidate, animated: this.isAnimated };
    }
    return { loaded: false, path: null, animated: false };
  }

  /** Sustituye el contenido actual por el GLTF recién cargado. */
  _attachModel(gltf, animations, fit, source) {
    this.model?.mixer?.stopAllAction();
    this.model = null;
    if (this.modelHolder) {
      this.visual.remove(this.modelHolder);
      this.modelHolder = null;
    }

    const hasClips = !!gltf.animations?.length;
    if (hasClips) this.model = new AnimatedModel(gltf, { animations });
    const content = hasClips ? this.model.root : gltf.scene;

    this.modelHolder = fit ? createFittedHolder(content, fit).pivot : content;
    this.visual.add(this.modelHolder);
    this.source = source;

    // El monigote ya no hace falta.
    if (this.fallback) {
      this.visual.remove(this.fallback);
      this.fallback = null;
    }
    this._applyMotion(this.motion);
    this.onModel?.({ path: source, animated: hasClips, label: this.label });
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
   * @param {number} time Tiempo global (compatibilidad con llamadas anteriores).
   */
  update(delta, time = 0) {
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this._phase += step;
    if (this.model) {
      this.model.update(step);
      return;
    }
    if (!this.procedural) return;
    this._applyProcedural(step);
  }

  /** Balanceo/rebote para modelos sin clips y para el monigote de respaldo. */
  _applyProcedural(step) {
    const cfg = PROCEDURAL_MOTIONS[this.motion] ?? PROCEDURAL_MOTIONS.idle;
    const targetBob = cfg.bob * Math.sin(this._phase * cfg.freq * Math.PI * 2);
    const targetSway = cfg.sway * Math.sin(this._phase * cfg.freq * Math.PI);
    const blend = Math.min(1, step * 8);

    this._bob += (targetBob - this._bob) * blend;
    this._lean += (cfg.lean - this._lean) * blend;
    this._sway += (targetSway - this._sway) * blend;

    this.visual.position.y = this._bob;
    this.visual.rotation.x = this._lean;
    this.visual.rotation.z = this._sway;
  }

  /** Orientación y posición de la entidad. */
  setTransform(x, y, z, heading = 0) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = heading;
  }

  /** Libera recursos (los mixers del modelo). */
  dispose() {
    this.model?.mixer?.stopAllAction();
    this.model = null;
    if (this.modelHolder) {
      this.visual.remove(this.modelHolder);
      this.modelHolder = null;
    }
    this.fallback = null;
  }
}
