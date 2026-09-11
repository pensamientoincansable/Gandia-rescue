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
 *     balanceo/rebote coherente con el estado (reposo, caminar, correr, saltar)
 *     y, además, si el asset trae un esqueleto con los nombres de hueso del
 *     pack de personajes, un balanceo real de brazos/piernas y respiración
 *     (véase `_applyRigMotion`).
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

/**
 * Movimiento ESQUELETAL procedural para personajes sin clips (p. ej. el pack
 * `media/Fantasy Character`, cuyos FBX no traen animaciones). Se maneja por
 * nombre de hueso del rig UE (upperarm_l, thigh_l, calf_l, spine_02…) con
 * ejes convertidos al espacio del personaje, así funciona con cualquier
 * esqueleto que use esos nombres y es inofensivo para el resto (animales,
 * props): si no encuentra los huesos, no hace nada.
 *
 * Convenciones medidas sobre el asset (rotación + alrededor del eje
 * izquierda-derecha del personaje): pierna hacia ATRÁS, rodilla SE DOBLA
 * (talón atrás), brazo hacia DELANTE.
 */
const RIG_MOTIONS = {
  idle: { stepFreq: 0, legSwing: 0, kneeBend: 0, armSwing: 0.03, armFreq: 0.32, breath: 0.014, breathFreq: 0.26 },
  talk: { stepFreq: 0, legSwing: 0, kneeBend: 0, armSwing: 0.08, armFreq: 0.55, breath: 0.02, breathFreq: 0.34 },
  walk: { stepFreq: 1.9, legSwing: 0.4, kneeBend: 0.5, armSwing: 0.35, armFreq: 0, breath: 0.01, breathFreq: 0.3 },
  run: { stepFreq: 3.2, legSwing: 0.75, kneeBend: 0.9, armSwing: 0.7, armFreq: 0, breath: 0.018, breathFreq: 0.5 },
  sprint: { stepFreq: 3.2, legSwing: 0.75, kneeBend: 0.9, armSwing: 0.7, armFreq: 0, breath: 0.018, breathFreq: 0.5 },
  jump: { stepFreq: 0, legSwing: 0.3, kneeBend: 0.55, armSwing: 0.2, armFreq: 0, breath: 0, breathFreq: 0, tuck: true },
  fly: { stepFreq: 0, legSwing: 0, kneeBend: 0, armSwing: 0, armFreq: 0, breath: 0, breathFreq: 0 },
};

/** Huesos animados por grupo (nombres del rig UE compartidos por el pack). */
const RIG_BONES = {
  arms: ['upperarm_l', 'upperarm_r'],
  thighs: ['thigh_l', 'thigh_r'],
  calves: ['calf_l', 'calf_r'],
  spine: ['spine_02', 'spine_03'],
};

/* Vectores/cuaterniones reutilizables (evita basura por fotograma). */
const _swingAxis = /*@__PURE__*/ new THREE.Vector3();
const _parentQuat = /*@__PURE__*/ new THREE.Quaternion();
const _swingQuat = /*@__PURE__*/ new THREE.Quaternion();

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
    this._rig = null;         // huesos del movimiento esquelético procedural

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
    this._rig = null;
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

    // Capturar el rig (si el asset trae huesos con nombres del pack) para el
    // movimiento esquelético procedural.
    if (!hasClips) this._captureRig(content);

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

  /**
   * Acopla un Object3D ya montado (p. ej. un personaje modular de
   * `CharacterSystem`) como si fuera un modelo cargado. El objeto se ajusta
   * con `fit` si la entidad lo tiene configurado.
   * @param {THREE.Object3D} object
   * @param {string} [source] Etiqueta de diagnóstico del asset.
   */
  attachModelObject(object, source = 'custom') {
    if (!object) return { loaded: false, path: null, animated: false };
    this._attachModel({ scene: object, animations: [] }, this.animations, this.fit, source);
    return { loaded: true, path: source, animated: false };
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
    this._applyRigMotion();
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

  /* -------------------------------------------------------------- rig procedural */

  /**
   * Localiza los nodos que hay que rotar para animar cada grupo del rig.
   *
   * El pack de personajes llega con cada hueso como HOJA colgada de un
   * contenedor identidad (`bone → X_2 → X_1`): la cadena cinemática vive en
   * los nodos `X_1` (con rotación/posición reales), así que el nodo a rotar
   * es `bone.parent.parent`. En rigs clásicos (huesos encadenados
   * directamente) el nodo a rotar es el propio hueso. Se distingue
   * comprobando si el hueso tiene huesos hijos.
   * @param {THREE.Object3D} content Raíz del modelo adjunto.
   */
  _captureRig(content) {
    if (!this.procedural) return;
    let skeleton = null;
    content.traverse((node) => {
      if (!skeleton && node.isSkinnedMesh) skeleton = node.skeleton;
    });
    if (!skeleton?.bones?.length) return;

    const byName = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
    const rotNodeFor = (name) => {
      const bone = byName.get(name);
      if (!bone) return null;
      const hasBoneChildren = bone.children.some((child) => child.isBone);
      if (hasBoneChildren) return bone;                       // rig clásico
      const container = bone.parent?.parent ?? bone.parent;   // patrón X_2/X_1
      return container ?? null;
    };

    const groups = {};
    let any = false;
    for (const [group, names] of Object.entries(RIG_BONES)) {
      groups[group] = names.map(rotNodeFor).filter(Boolean);
      if (groups[group].length) any = true;
    }
    if (!any) return; // rig desconocido (animal, prop…): sin animación ósea

    // Pose de reposo de cada nodo (las rotaciones SIEMPRE parten de ella,
    // así no se acumulan errores entre fotogramas ni al cambiar de estado).
    const rest = new Map();
    for (const list of Object.values(groups)) {
      for (const node of list) {
        if (!rest.has(node.uuid)) rest.set(node.uuid, node.quaternion.clone());
      }
    }
    this._rig = { groups, rest, skeleton };
  }

  /**
   * Balanceo de brazos/piernas y respiración para modelos esqueletados sin
   * clips. Convenciones (+ángulo sobre el eje izquierda-derecha del persona-
   * je): pierna atrás, rodilla doblada, brazo delante.
   */
  _applyRigMotion() {
    const rig = this._rig;
    if (!rig) return;
    const cfg = RIG_MOTIONS[this.motion] ?? RIG_MOTIONS.idle;
    const t = this._phase;

    // Ciclo de zancada: swing > 0 ⇒ pierna izquierda adelantada.
    const swing = cfg.stepFreq ? Math.sin(t * cfg.stepFreq * Math.PI * 2) : 0;
    const legL = cfg.tuck ? -cfg.legSwing : -cfg.legSwing * swing;
    const legR = cfg.tuck ? -cfg.legSwing : cfg.legSwing * swing;
    // La rodilla sólo se dobla en un sentido (nunca se hiperextiende).
    const kneeL = cfg.tuck ? cfg.kneeBend : cfg.kneeBend * Math.max(0, -swing);
    const kneeR = cfg.tuck ? cfg.kneeBend : cfg.kneeBend * Math.max(0, swing);
    // Brazos en contrafase con las piernas del mismo lado.
    const armL = cfg.tuck ? -cfg.armSwing : -cfg.armSwing * swing;
    const armR = cfg.tuck ? -cfg.armSwing : cfg.armSwing * swing;
    // Micro-balanceo de brazos en reposo/conversación.
    const idleArm = cfg.armFreq ? Math.sin(t * cfg.armFreq * Math.PI * 2) * cfg.armSwing : 0;
    const idleArmR = cfg.armFreq ? Math.sin(t * cfg.armFreq * Math.PI * 2 + 1.1) * cfg.armSwing : 0;
    const breath = cfg.breath ? Math.sin(t * cfg.breathFreq * Math.PI * 2) * cfg.breath : 0;

    const { arms, thighs, calves, spine } = rig.groups;
    this._swingRigNode(thighs[0], legL);
    this._swingRigNode(thighs[1], legR);
    this._swingRigNode(calves[0], kneeL);
    this._swingRigNode(calves[1], kneeR);
    this._swingRigNode(arms[0], armL + idleArm);
    this._swingRigNode(arms[1], armR + idleArmR);
    for (const node of spine) this._swingRigNode(node, breath);
  }

  /**
   * Aplica a un nodo del rig una rotación (en radianes) alrededor del eje
   * izquierda-derecha del PERSONAJE, respetando su pose de reposo. El eje se
   * convierte al espacio local del padre con su cuaternión mundial, de modo
   * que funciona con cualquier orientación de origen del asset.
   * @param {THREE.Object3D|null} node
   * @param {number} angle
   */
  _swingRigNode(node, angle) {
    if (!node) return;
    const rest = this._rig.rest.get(node.uuid);
    if (!rest) return;
    if (!angle) {
      node.quaternion.copy(rest);
      return;
    }
    node.parent?.getWorldQuaternion(_parentQuat);
    _parentQuat.invert();
    _swingAxis.set(1, 0, 0).applyQuaternion(_parentQuat).normalize();
    _swingQuat.setFromAxisAngle(_swingAxis, angle);
    node.quaternion.copy(rest).multiply(_swingQuat);
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
    this._rig = null;
    if (this.modelHolder) {
      this.visual.remove(this.modelHolder);
      this.modelHolder = null;
    }
    this.fallback = null;
  }
}
