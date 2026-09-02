import * as THREE from 'three';

/**
 * AnimatedModel — envoltura de un modelo GLTF animado.
 *
 * Crea un `THREE.AnimationMixer` sobre la escena cargada y expone un método
 * `playMotion(name)` que gestiona los clips de animación (reposo, caminar,
 * correr, saltar…) con transiciones suaves (crossfade). De esta forma el resto
 * del juego sólo necesita pedir "estado de movimiento" y no conocer los nombres
 * exactos de los clips dentro de cada asset.
 */

const LOOP_MOTIONS = new Set(['idle', 'walk', 'run', 'sprint', 'fly', 'swim']);
const ONE_SHOT_MOTIONS = new Set(['jump', 'attack', 'talk', 'hurt', 'dead']);

export class AnimatedModel {
  /**
   * @param {import('three').GLTF} gltf
   * @param {{ animations?: Record<string,string> }} [options] Mapa "estado →
   *   nombre de clip" (ver DEFAULT_MODELS).
   */
  constructor(gltf, options = {}) {
    this.root = gltf?.scene ?? new THREE.Group();
    this.clips = gltf?.animations ?? [];
    this.animationMap = options.animations ?? {};
    this.mixer = gltf && this.clips.length ? new THREE.AnimationMixer(this.root) : null;

    // Índice de acciones por clip para reutilizarlas en cada transición.
    this._actions = new Map();
    this._currentName = null;
    if (this.mixer) {
      for (const clip of this.clips) {
        const action = this.mixer.clipAction(clip);
        action.enabled = true;
        this._actions.set(clip.name, action);
      }
    }
  }

  get hasAnimations() {
    return !!this.mixer && this._actions.size > 0;
  }

  /**
   * Busca el clip más parecido a una etiqueta de movimiento ("walk", "idle"…)
   * usando la tabla de animaciones o coincidencia por nombre.
   */
  _findClip(motionName) {
    const explicit = this.animationMap[motionName];
    if (explicit && this._actions.has(explicit)) return explicit;
    const target = motionName.toLowerCase();
    for (const name of this._actions.keys()) {
      if (name.toLowerCase() === target) return name;
    }
    for (const name of this._actions.keys()) {
      if (name.toLowerCase().includes(target)) return name;
    }
    return null;
  }

  /**
   * Reproduce un estado de movimiento con crossfade.
   * @param {string} motionName 'idle' | 'walk' | 'run' | 'jump' | …
   * @param {{fade?:number, speed?:number}} [options]
   */
  playMotion(motionName, { fade = 0.2, speed = 1 } = {}) {
    if (!this.hasAnimations) return;
    const clipName = this._findClip(motionName);
    if (!clipName) return;
    if (this._currentName === clipName) {
      // Actualizar velocidad aunque el clip ya esté sonando (caminar ↔ correr).
      const current = this._actions.get(clipName);
      current.timeScale = speed;
      return;
    }

    const next = this._actions.get(clipName);
    if (this._currentName) this._actions.get(this._currentName)?.fadeOut(fade);

    const isLoop = LOOP_MOTIONS.has(motionName) || !ONE_SHOT_MOTIONS.has(motionName);
    next.reset()
      .setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, 1)
      .setEffectiveTimeScale(speed)
      .setEffectiveWeight(1)
      .clampWhenFinished = !isLoop;
    next.fadeIn(fade);
    next.play();

    // Si es un "one-shot" (salto), al terminar volvemos al reposo.
    if (!isLoop) {
      next.reset().play();
      next.clampWhenFinished = true;
    }
    this._currentName = clipName;
  }

  /** Avanza el mixer un fotograma. */
  update(delta) {
    this.mixer?.update(delta);
  }
}
