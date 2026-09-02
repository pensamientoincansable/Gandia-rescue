import * as THREE from 'three';

/**
 * GroundCollider — colisión con el terreno mediante raycasting vertical.
 *
 * Resuelve el bug de la Montaña del Mondúver (y de cualquier relieve complejo):
 * el jugador ya no depende sólo de la altura analítica `terrain.getHeight()`
 * para "pegarse" al suelo, sino que lanza un rayo vertical hacia abajo desde el
 * centro del personaje y lee la altura REAL de la primera superficie sólida
 * (la malla del terreno) en sus coordenadas (X, Z).
 *
 * Además implementa integración vertical con Detección Continua de Colisiones
 * (CCD): el desplazamiento en Y se divide en sub-pasos pequeños para que, a
 * altas velocidades de caída o con mallas delgadas, el personaje nunca
 * "atraviese" (tunneling) la superficie en un solo fotograma.
 */

export const UP = new THREE.Vector3(0, 1, 0);
export const DOWN = new THREE.Vector3(0, -1, 0);

/** Tamaño de sub-paso (segundos) usado por el CCD vertical. */
export const CCD_STEP = 0.016;

export class GroundCollider {
  /**
   * @param {{ maxDist?: number }} [options] Distancia máxima del rayo.
   */
  constructor({ maxDist = 500 } = {}) {
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = maxDist;
    // Mallas sólidas sobre las que raycastar (terreno + hitos).
    this._targets = [];
    this._origin = new THREE.Vector3();
  }

  /** Registra una malla sólida en la que apoyarse. */
  addMesh(mesh) {
    if (mesh && !this._targets.includes(mesh)) this._targets.push(mesh);
  }

  /** Sustituye el conjunto completo de mallas de colisión. */
  setMeshes(meshes = []) {
    this._targets = meshes.filter(Boolean);
  }

  get targetCount() {
    return this._targets.length;
  }

  clear() {
    this._targets.length = 0;
  }

  /**
   * Raycast vertical hacia el suelo desde (x, z).
   *
   * @param {number} x Coordenada X del centro del personaje.
   * @param {number} z Coordenada Z del centro del personaje.
   * @param {number} [fromHeight] Altura de la que parte el rayo (debe quedar
   *   por ENCIMA de la superficie para detectarla). Por defecto un valor alto.
   * @returns {number|null} Altura Y real del terreno, o null si no hay
   *   geometría registrada (el llamador usará la altura analítica como respaldo).
   */
  groundHeightAt(x, z, fromHeight = 500) {
    if (this._targets.length === 0) return null;
    this._origin.set(x, fromHeight, z);
    this._raycaster.set(this._origin, DOWN);
    const hits = this._raycaster.intersectObjects(this._targets, false);
    if (hits.length === 0) return null;

    // Tomamos la primera cara atravesada mirando hacia arriba (la superficie
    // pisable). Si sólo hay caras invertidas (parte inferior de un saliente),
    // seguimos buscando la siguiente superficie bajo el personaje.
    for (const hit of hits) {
      // vector normal de la cara en coordenadas de mundo
      const n = hit.face && hit.object.matrixWorld
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : UP;
      if (n.y > 0.05) return hit.point.y;
    }
    // Sin cara "hacia arriba": devolvemos el primer impacto de todas formas.
    return hits[0].point.y;
  }

  /**
   * Integración vertical con CCD: mueve la coordenada Y con gravedad evitando
   * atravesar el terreno.
   *
   * @param {{x:number,z:number}} posXZ Coordenadas horizontales.
   * @param {number} y Altura actual (pies del personaje).
   * @param {number} vy Velocidad vertical actual (m/s).
   * @param {number} delta Paso de tiempo (s).
   * @param {{gravity:number, maxFallSpeed:number}} params Parámetros físicos.
   * @param {(x:number,z:number,fromY:number)=>number} groundResolver Devuelve la
   *   altura del suelo (raycast con respaldo analítico).
   * @returns {{y:number, vy:number, grounded:boolean}}
   */
  integrateVertical(posXZ, y, vy, delta, params, groundResolver) {
    const gravity = params.gravity ?? -18.5;
    const maxFallSpeed = params.maxFallSpeed ?? -40;

    // Si ya estamos sobre el suelo, lo mantenemos fijo (sin "hundirse").
    const initialGround = groundResolver(posXZ.x, posXZ.z, y + 0.5);
    if (vy >= 0 && initialGround !== null && y <= initialGround) {
      return { y: initialGround, vy: 0, grounded: true };
    }

    let currentY = y;
    let currentVy = vy;
    let grounded = false;
    let remaining = Math.max(0, delta);

    // CCD: dividimos el desplazamiento en sub-pasos cortos.
    while (remaining > 0 && !grounded) {
      const dt = Math.min(CCD_STEP, remaining);
      currentVy = Math.max(maxFallSpeed, currentVy + gravity * dt);
      const nextY = currentY + currentVy * dt;

      // Raycast desde la altura previa (sigue quedando por encima si la
      // superficie sube) para conocer el suelo real bajo el personaje.
      const ground = groundResolver(posXZ.x, posXZ.z, currentY + 0.5);

      if (ground !== null && nextY <= ground) {
        // Chocamos con la superficie dentro de este sub-paso: clavamos y paramos.
        currentY = ground;
        currentVy = 0;
        grounded = true;
      } else {
        currentY = nextY;
      }
      remaining -= dt;
    }

    return { y: currentY, vy: currentVy, grounded };
  }
}
