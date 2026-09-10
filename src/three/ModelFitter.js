import * as THREE from 'three';

/**
 * ModelFitter — normaliza modelos 3D de origen arbitrario (p. ej. generados con
 * IA en SupaVoxel, descargados de Sketchfab…) para que encajen en el juego sin
 * editar el asset a mano.
 *
 * Los `.glb` externos llegan con unidades y orientación impredecibles: un
 * personaje puede medir 1.8 (metros), 180 (centímetros) o 0.018 (km), y mirar a
 * +Z, -Z o +X. El juego, en cambio, necesita personajes de ~1.85 m, con los pies
 * en `y = 0`, centrados en XZ y mirando a +Z (el `heading` del motor rota sobre
 * ese eje). Este módulo calcula esa transformación a partir de la caja
 * envolvente real del asset y la aplica sobre un grupo intermedio, de modo que
 * el asset original nunca se modifica.
 *
 * Jerarquía resultante:
 *   pivot (origen = pies del personaje, el juego le aplica posición y heading)
 *     └ pose (rotación de corrección + escala uniforme + centrado)
 *         └ modelo GLTF original
 *
 * Uso:
 *   const { pivot } = createFittedHolder(gltf.scene, { height: 1.85 });
 *   characterRoot.add(pivot);
 */

/** Valores por defecto del ajuste (ver `normalizeFit`). */
export const DEFAULT_FIT = {
  height: null,   // altura objetivo en metros; `null` = respetar la escala original
  center: true,   // centrar el asset en XZ sobre el origen del pivot
  ground: 0,      // altura local del suelo (pies del personaje)
  rotation: { x: 0, y: 0, z: 0 }, // grados: corrige ejes (Z-up) u orientación
  shadows: true,  // proyectar sombras con las mallas del asset
};

const DEG_TO_RAD = Math.PI / 180;
const MIN_SCALE = 1e-4;
const MAX_SCALE = 1e4;

/**
 * Completa un objeto `fit` parcial con los valores por defecto.
 * @param {Partial<typeof DEFAULT_FIT>|null|undefined} fit
 * @returns {typeof DEFAULT_FIT}
 */
export function normalizeFit(fit = {}) {
  const src = fit && typeof fit === 'object' ? fit : {};
  const rot = src.rotation && typeof src.rotation === 'object' ? src.rotation : {};
  const height = Number(src.height);
  return {
    height: Number.isFinite(height) && height > 0 ? height : null,
    center: src.center !== false,
    ground: Number.isFinite(Number(src.ground)) ? Number(src.ground) : 0,
    rotation: {
      x: Number(rot.x) || 0,
      y: Number(rot.y) || 0,
      z: Number(rot.z) || 0,
    },
    shadows: src.shadows !== false,
  };
}

/**
 * Mide la caja envolvente real de un objeto (tras actualizar sus matrices).
 * @param {THREE.Object3D} object3d
 * @returns {{ box: THREE.Box3, size: THREE.Vector3, center: THREE.Vector3, empty: boolean }}
 */
export function measureObject(object3d) {
  object3d.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object3d, true);
  const empty = box.isEmpty();
  const size = empty ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const center = empty ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  return { box, size, center, empty };
}

/**
 * Envuelve un modelo en un grupo ya ajustado a las medidas del juego.
 * @param {THREE.Object3D} source Escena cargada (`gltf.scene`) o raíz animada.
 * @param {Partial<typeof DEFAULT_FIT>} [fit]
 * @returns {{ pivot: THREE.Group, pose: THREE.Group, scale: number,
 *            size: THREE.Vector3, sourceSize: THREE.Vector3 }}
 */
export function createFittedHolder(source, fit = {}) {
  const cfg = normalizeFit(fit);

  const pose = new THREE.Group();
  pose.name = 'ModelFit';
  pose.add(source);
  pose.rotation.set(
    cfg.rotation.x * DEG_TO_RAD,
    cfg.rotation.y * DEG_TO_RAD,
    cfg.rotation.z * DEG_TO_RAD,
  );

  // La medición se hace DESPUÉS de la rotación de corrección: así un asset
  // Z-up mide su altura real una vez tumbado sobre el plano del juego.
  const { box, size, empty } = measureObject(pose);

  let scale = 1;
  if (cfg.height && !empty && size.y > 1e-5) {
    scale = THREE.MathUtils.clamp(cfg.height / size.y, MIN_SCALE, MAX_SCALE);
  }

  const centerX = cfg.center && !empty ? (box.min.x + box.max.x) / 2 : 0;
  const centerZ = cfg.center && !empty ? (box.min.z + box.max.z) / 2 : 0;
  const floorY = !empty ? box.min.y : 0;

  pose.scale.setScalar(scale);
  pose.position.set(
    -centerX * scale,
    -floorY * scale + cfg.ground,
    -centerZ * scale,
  );

  const pivot = new THREE.Group();
  pivot.name = 'ModelPivot';
  pivot.add(pose);

  if (cfg.shadows) {
    pivot.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
  }

  return {
    pivot,
    pose,
    scale,
    size: size.clone().multiplyScalar(scale),
    sourceSize: size.clone(),
  };
}

/**
 * Ajusta un modelo ya emparentado: mide su caja actual y devuelve el factor de
 * escala que lo llevaría a la altura objetivo (útil para diagnósticos y pruebas).
 * @param {THREE.Object3D} object3d
 * @param {number} targetHeight
 * @returns {number} factor de escala (1 si no se puede medir)
 */
export function scaleToHeight(object3d, targetHeight) {
  const { size, empty } = measureObject(object3d);
  if (empty || !(targetHeight > 0) || size.y <= 1e-5) return 1;
  return THREE.MathUtils.clamp(targetHeight / size.y, MIN_SCALE, MAX_SCALE);
}
