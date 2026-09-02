/**
 * ObstacleCollider — colisión horizontal contra los objetos del mundo.
 *
 * Hasta ahora la furgoneta atravesaba árboles, rocas, farolas y fachadas: el
 * motor sólo resolvía la altura del suelo (raycasting vertical), nunca los
 * obstáculos. Esta clase mantiene un registro espacial (rejilla uniforme) de
 * todos los objetos sólidos de la zona y resuelve el contacto como
 * círculo-contra-círculo:
 *
 *   · se empuja al vehículo fuera del obstáculo (nunca dentro);
 *   · se devuelve la normal media del contacto para que la física pueda
 *     **deslizar** la velocidad en vez de frenar en seco;
 *   · los obstáculos “blandos” (hierba, carrizos) sólo frenan un poco.
 *
 * La rejilla evita comparar contra los miles de instancias de cada zona: una
 * consulta sólo revisa las celdas que toca el círculo del jugador.
 */

/** Obstáculos por celda por defecto (equilibra memoria y consultas). */
const DEFAULT_CELL = 16;

export class ObstacleCollider {
  /**
   * @param {{ cellSize?: number }} [options]
   */
  constructor({ cellSize = DEFAULT_CELL } = {}) {
    this.cellSize = cellSize;
    this._items = [];
    this._grid = new Map();
  }

  /** Número de obstáculos registrados. */
  get count() {
    return this._items.length;
  }

  /** Vacía el registro (se llama al cambiar de zona). */
  clear() {
    this._items.length = 0;
    this._grid.clear();
  }

  _key(cx, cz) {
    return `${cx},${cz}`;
  }

  _register(index, x, z, radius) {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cz = minZ; cz <= maxZ; cz += 1) {
        const key = this._key(cx, cz);
        let bucket = this._grid.get(key);
        if (!bucket) {
          bucket = [];
          this._grid.set(key, bucket);
        }
        bucket.push(index);
      }
    }
  }

  /**
   * Registra un obstáculo.
   *
   * @param {{x:number, z:number, radius:number, height?:number, soft?:boolean, type?:string}} obstacle
   * @returns {object} el obstáculo registrado (por si el llamador quiere mutarlo)
   */
  add(obstacle) {
    if (!obstacle || typeof obstacle.x !== 'number' || typeof obstacle.z !== 'number') return null;
    const item = {
      x: obstacle.x,
      z: obstacle.z,
      radius: obstacle.radius ?? 1,
      height: obstacle.height ?? 2,
      soft: obstacle.soft ?? false,
      type: obstacle.type ?? 'prop',
    };
    const index = this._items.length;
    this._items.push(item);
    this._register(index, item.x, item.z, item.radius);
    return item;
  }

  /** Registra muchos obstáculos de una vez (atalajes, arbolado, rocas…). */
  addMany(obstacles = []) {
    const added = [];
    for (const obstacle of obstacles) {
      const item = this.add(obstacle);
      if (item) added.push(item);
    }
    return added;
  }

  /**
   * Obstáculos cercanos a un círculo. Se devuelven con posible repetición si
   * un obstáculo toca varias celdas consultadas; el llamador los filtra.
   *
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @returns {object[]}
   */
  query(x, z, radius = 0) {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    const found = [];
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cz = minZ; cz <= maxZ; cz += 1) {
        const bucket = this._grid.get(this._key(cx, cz));
        if (!bucket) continue;
        for (const index of bucket) {
          const item = this._items[index];
          if (!found.includes(item)) found.push(item);
        }
      }
    }
    return found;
  }

  /**
   * Comprueba si un punto está dentro de algún obstáculo sólido.
   * @returns {object|null} el obstáculo que lo contiene, o null.
   */
  obstacleAt(x, z, radius = 0) {
    for (const item of this.query(x, z, radius + 2)) {
      if (item.soft) continue;
      if (Math.hypot(x - item.x, z - item.z) < item.radius + radius) return item;
    }
    return null;
  }

  /**
   * Resuelve el contacto de un círculo móvil contra el mundo.
   *
   * @param {number} x Posiciónactual en X.
   * @param {number} z Posición actual en Z.
   * @param {number} radius Radio del cuerpo (furgoneta ≈ 2 m, guardián ≈ 0.4 m).
   * @param {{ respectSoft?: boolean }} [options] Si es falso, la hierba y los
   * carrizos no frenan al vehículo (sólo los obstáculos sólidos).
   * @returns {{x:number, z:number, hit:boolean, soft:boolean, nx:number, nz:number, depth:number, obstacle:object|null}}
   *   Posición corregida, si hubo contacto y la normal media del mismo.
   */
  resolveCircle(x, z, radius, { respectSoft = true } = {}) {
    if (this._items.length === 0) {
      return { x, z, hit: false, soft: false, nx: 0, nz: 0, depth: 0, obstacle: null };
    }

    const originX = x;
    const originZ = z;
    let nx = 0;
    let nz = 0;
    let depth = 0;
    let hit = false;
    let soft = false;
    let obstacle = null;

    // Dos pasadas: la segunda corrige el “efecto sándwich” entre dos objetos
    // (al salir de uno podemos haber entrado en el de al lado).
    let candidates = this.query(x, z, radius + 4);
    const touched = new Set();

    for (let pass = 0; pass < 2; pass += 1) {
      let moved = false;
      for (const item of candidates) {
        if (pass > 0 && !touched.has(item)) continue;

        const dx = x - item.x;
        const dz = z - item.z;
        const minDist = radius + item.radius;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= minDist * minDist) continue;

        const distance = Math.sqrt(distanceSq) || 0.0001;
        const push = minDist - distance;
        // Si el centro coincide exactamente, elegimos una dirección válida.
        const ux = distance > 0.0002 ? dx / distance : 1;
        const uz = distance > 0.0002 ? dz / distance : 0;

        x += ux * push;
        z += uz * push;
        nx += ux;
        nz += uz;
        depth = Math.max(depth, push);
        hit = true;
        moved = true;
        touched.add(item);
        if (item.soft) soft = true;
        if (!item.soft || !obstacle) obstacle = item;
      }
      if (!moved) break;
      candidates = Array.from(touched);
    }

    const length = Math.hypot(nx, nz);
    if (length > 0.0001) {
      nx /= length;
      nz /= length;
    } else {
      nx = 0;
      nz = 0;
    }

    // Los obstáculos blandos no desplazan: sólo informan del rozamiento.
    if (hit && soft && !respectSoft) {
      return { x: originX, z: originZ, hit: false, soft: true, nx, nz, depth, obstacle };
    }

    return { x, z, hit, soft, nx, nz, depth, obstacle };
  }

  /**
   * ¿El segmento entre dos puntos atraviesa algún obstáculo sólido?
   * Útil como detección continua (CCD) cuando el vehículo va muy rápido y en
   * un solo fotograma podría “saltarse” un tronco fino.
   */
  segmentBlocked(fromX, fromZ, toX, toZ, radius) {
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / Math.max(0.5, radius)));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = fromX + (toX - fromX) * t;
      const z = fromZ + (toZ - fromZ) * t;
      const resolution = this.resolveCircle(x, z, radius);
      if (resolution.hit) {
        return {
          blocked: true,
          x: resolution.x,
          z: resolution.z,
          nx: resolution.nx,
          nz: resolution.nz,
          obstacle: resolution.obstacle,
        };
      }
    }
    return { blocked: false, x: toX, z: toZ, nx: 0, nz: 0, obstacle: null };
  }
}
