import * as THREE from 'three';
import {
  createGroundTexture, createSatelliteRouteTexture, createWaterTexture,
} from './TextureFactory.js';
import { GROUND_STYLES } from './WorldAssets.js';
import { GroundCollider } from './GroundCollider.js';
import { ObstacleCollider } from './ObstacleCollider.js';
import { loadLandmark } from './PropsLibrary.js';

/**
 * Generador de terrenos 3D procedurales para las 6 localizaciones de Gandía.
 * Proporciona malla de terreno con materiales propios por hábitat, agua
 * animada, rutas practicables (la única superficie que conserva la fotografía
 * satelital), hitos modelados en `.glb` y función de elevación continua
 * `getHeight(x, z)`.
 *
 * Además del cálculo analítico:
 *   · registra todas las mallas sólidas de la zona en un `GroundCollider` para
 *     hacer **raycasting vertical real** hacia el suelo (`getGroundHeight`);
 *   · registra los objetos del mundo en un `ObstacleCollider` para que la
 *     furgoneta y el guardián **choquen** con árboles, rocas, fachadas y
 *     mobiliario en lugar de atravesarlos.
 */

/** Corredores de las rutas practicables, en coordenadas de mundo. */
export const ROUTE_CORRIDORS = Object.freeze({
  // Paseo marítimo / carretera de la playa (eje Z) y su ramal de servicio.
  platja: Object.freeze([
    { x: -15, z: 0, halfWidth: 6.5, halfLength: 125, axis: 'z' },
  ]),
  // Vía principal de acceso a la lonja y al muelle.
  port: Object.freeze([
    { x: -10, z: 0, halfWidth: 7, halfLength: 120, axis: 'z' },
  ]),
  // Camino rural entre los arrozales.
  marjal: Object.freeze([
    { x: -20, z: 0, halfWidth: 5.5, halfLength: 120, axis: 'z' },
  ]),
  // Carretera de ribera del Serpis y tablero del puente.
  riu: Object.freeze([
    { x: -35, z: 0, halfWidth: 6, halfLength: 115, axis: 'z' },
    { x: 0, z: 0, halfWidth: 5.5, halfLength: 30, axis: 'z' },
  ]),
  // Dos vías adoquinadas que cruzan la plaza histórica.
  casc: Object.freeze([
    { x: 0, z: 0, halfWidth: 6, halfLength: 118, axis: 'z' },
    { x: 0, z: 0, halfWidth: 6, halfLength: 118, axis: 'x' },
  ]),
});

/** Pista forestal serpenteante hacia la cumbre del Montdúver. */
export const MOUNTAIN_ROUTE = Object.freeze([
  [-70, -70], [-40, -20], [10, -40], [35, 10], [0, 0],
]);

/**
 * Láminas de agua por zona.
 *
 * `level` es la altura de la superficie. Salvo las zonas marcadas como `wade`
 * (el carrizal y los canales someros de la marjal, que el vehículo puede
 * vadear), el agua es **infranqueable**: la furgoneta se detiene en la orilla
 * en lugar de meterse en el mar, en la dársena o en el cauce del Serpis.
 * `margin` ensancha la barrera para que el morro —y no el centro del
 * vehículo— sea lo que toque el agua.
 */
const WATER_AREAS = Object.freeze({
  platja: Object.freeze([
    { kind: 'rect', minX: 56, maxX: 140, minZ: -140, maxZ: 140, level: -0.35 },
  ]),
  port: Object.freeze([
    { kind: 'rect', minX: 26, maxX: 140, minZ: -78, maxZ: 78, level: -0.55 },
  ]),
  marjal: Object.freeze([
    { kind: 'rect', minX: 12, maxX: 48, minZ: -6, maxZ: 46, level: 0.05 },
    { kind: 'canal', level: -0.55, halfWidth: 6, wade: true, depth: 0.35 },
  ]),
  riu: Object.freeze([
    { kind: 'river', level: -0.9, halfWidth: 13.5 },
  ]),
  casc: Object.freeze([]),
  montduver: Object.freeze([]),
});

/**
 * Hitos modelados por zona. La huella (`collide`) se registra inmediatamente
 * en el `ObstacleCollider`, sin esperar a que el `.glb` termine de descargarse,
 * para que la furgoneta nunca pueda atravesar un edificio “fantasma”.
 */
const LANDMARKS = Object.freeze({
  platja: Object.freeze([
    { prop: 'lifeguardTower', x: 34, z: 22, rotation: -0.35, scale: 1, collide: { radius: 2.4, height: 9 } },
    { prop: 'lifeguardTower', x: 34, z: -66, rotation: 0.25, scale: 0.95, collide: { radius: 2.3, height: 9 } },
    { prop: 'boardwalk', x: 4, z: -46, rotation: 0, scale: 1, collide: null, noCollide: true },
    { prop: 'boardwalk', x: 4, z: 46, rotation: 0, scale: 1, collide: null, noCollide: true },
  ]),
  port: Object.freeze([
    { prop: 'lighthouse', x: 48, z: -74, rotation: 0, scale: 1.05, collide: { radius: 4.2, height: 18 } },
    { prop: 'lighthouse', x: 48, z: 74, rotation: 0, scale: 1.05, collide: { radius: 4.2, height: 18 } },
    { prop: 'fishingBoat', x: 40, z: -18, rotation: 0.35, scale: 1, collide: { radius: 4.6, height: 8 } },
    { prop: 'fishingBoat', x: 40, z: 26, rotation: -0.5, scale: 0.92, collide: { radius: 4.3, height: 8 } },
    { prop: 'jetty', x: 40, z: 4, rotation: 0, scale: 1, collide: { radius: 3.2, height: 2 }, noCollide: true },
  ]),
  marjal: Object.freeze([
    { prop: 'alqueria', x: -54, z: 34, rotation: 0.28, scale: 1, collide: { radius: 11, height: 9 } },
    { prop: 'boardwalk', x: -20, z: -22, rotation: Math.PI / 2, scale: 0.55, collide: null, noCollide: true },
    { prop: 'boardwalk', x: -20, z: 52, rotation: Math.PI / 2, scale: 0.55, collide: null, noCollide: true },
  ]),
  riu: Object.freeze([
    // El tablero del puente es pisable: los pilares bajan hasta el lecho.
    { prop: 'bridgeArch', x: 0, z: 0, y: -1, rotation: 0, scale: 0.82, collide: null, noCollide: false },
  ]),
  casc: Object.freeze([
    { prop: 'collegiate', x: -46, z: -28, rotation: 0.1, scale: 1, collide: { radius: 15, height: 34 } },
    // La fuente preside el cruce: se rodea, como en cualquier plaza real.
    { prop: 'fountain', x: 0, z: 0, rotation: 0, scale: 1.15, collide: { radius: 4.5, height: 7 } },
  ]),
  montduver: Object.freeze([
    { prop: 'summitMast', x: 0, z: 0, rotation: 0, scale: 1, collide: { radius: 2.6, height: 24 } },
  ]),
});

/** Paletas de color por vértice: dan la variación de hábitat del terreno. */
const GROUND_VERTEX_PALETTES = {
  platja: { base: [1.0, 0.97, 0.88], wet: [0.84, 0.86, 0.87], high: [0.93, 0.95, 0.78], steep: [0.92, 0.9, 0.85] },
  port: { base: [0.97, 0.97, 0.95], wet: [0.8, 0.85, 0.9], high: [0.95, 0.95, 0.93], steep: [0.88, 0.88, 0.87] },
  marjal: { base: [0.88, 1.02, 0.82], wet: [0.7, 0.86, 0.9], high: [0.95, 1.0, 0.8], steep: [0.95, 0.9, 0.76] },
  riu: { base: [0.94, 1.0, 0.86], wet: [0.82, 0.92, 0.9], high: [0.96, 1.0, 0.84], steep: [0.93, 0.92, 0.86] },
  casc: { base: [1.0, 0.98, 0.93], wet: [0.86, 0.9, 0.92], high: [0.98, 0.97, 0.93], steep: [0.93, 0.92, 0.9] },
  montduver: { base: [0.95, 0.99, 0.86], wet: [0.8, 0.88, 0.9], high: [0.99, 0.97, 0.92], steep: [0.96, 0.94, 0.9] },
};

/** Ruido determinista barato para manchar el terreno por vértices. */
function patchNoise(x, z, seed = 0) {
  const value = Math.sin(x * 0.13 + seed) * Math.sin(z * 0.11 - seed * 1.7)
    + 0.5 * Math.sin(x * 0.041 - z * 0.037 + seed * 3.1);
  return value / 1.5;
}

export class TerrainBuilder {
  constructor(scene) {
    this.scene = scene;
    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);
    this.landmarkGroup = new THREE.Group();
    this.terrainGroup.add(this.landmarkGroup);
    this.waterMeshes = [];
    this.animatedObjects = [];

    // Colisiones reales por raycasting sobre las mallas del terreno.
    this.collider = new GroundCollider();
    // Colisiones horizontales contra los objetos del mundo (antes inexistentes).
    this.obstacles = new ObstacleCollider();
    this.terrainMesh = null;
    this._heightField = null;
    // Versión de zona: invalida cargas asíncronas de `.glb` de zonas viejas.
    this.zoneVersion = 0;
    this.zoneId = null;
  }

  /** Función de altura matemática para cada zona de Gandía */
  getHeight(x, z, zoneId) {
    if (zoneId === 'platja') {
      // Playa: plana a la izquierda (paseo), suave duna en el medio, orilla que desciende al mar en X > 60
      if (x > 50) return Math.max(-2.5, -0.06 * (x - 50));
      if (x > 10 && x <= 50) return Math.sin(z * 0.04) * 0.4 + Math.sin(x * 0.1) * 0.5;
      return 0.2; // Paseo marítimo y calzada
    }

    if (zoneId === 'port') {
      // Puerto: muelle a Y=0.8, dársena marina en X > 25 a Y=-1.2
      if (x > 25 && z < 70 && z > -70) return -1.5;
      return 0.8;
    }

    if (zoneId === 'marjal') {
      // Marjal: terreno bajo y llano con canales y ullals (manantiales).
      if (Math.hypot(x - 30, z - 20) < 17) return -1.15;
      const canal = Math.sin(z * 0.06) * 12;
      if (Math.abs(x - canal) < 6) return -0.9;
      return Math.sin(x * 0.05) * 0.3 + Math.cos(z * 0.05) * 0.3;
    }

    if (zoneId === 'riu') {
      // Riu Serpis: orillas a Y=1.5, cauce del río excavado en el centro (|x| < 18) a Y=-1.2
      const riverX = Math.sin(z * 0.03) * 8;
      const distToRiver = Math.abs(x - riverX);
      if (distToRiver < 14) {
        return -1.6 + Math.pow(distToRiver / 14, 2) * 2.8;
      }
      return 1.4 + Math.sin(x * 0.05) * 0.4;
    }

    if (zoneId === 'casc') {
      // Centro Histórico: plaza urbana nivelada
      return 0.1 + Math.sin(x * 0.02) * 0.1;
    }

    if (zoneId === 'montduver') {
      // Montdúver: gran macizo montañoso con cumbre en X=0, Z=0
      const dist = Math.hypot(x, z);
      const peak = Math.max(0, 32 - dist * 0.28);
      const crags = Math.sin(x * 0.15) * 1.8 + Math.cos(z * 0.15) * 1.8;
      return peak + (dist < 90 ? crags * (1 - dist / 90) : 0);
    }

    return 0;
  }

  /**
   * Altura de la lámina de agua en (x, z), o `null` si ahí no hay agua.
   * Se usa para impedir que la furgoneta se meta en el mar, en la dársena o
   * en el cauce del Serpis como si fueran asfalto.
   */
  waterLevelAt(x, z, zoneId = this.zoneId, margin = 0) {
    for (const area of WATER_AREAS[zoneId] ?? []) {
      if (area.kind === 'rect') {
        if (x >= area.minX - margin && x <= area.maxX + margin
          && z >= area.minZ - margin && z <= area.maxZ + margin) return area;
      } else if (area.kind === 'canal') {
        const canal = Math.sin(z * 0.06) * 12;
        if (Math.abs(x - canal) < area.halfWidth + margin) return area;
      } else if (area.kind === 'river') {
        const riverX = Math.sin(z * 0.03) * 8;
        if (Math.abs(x - riverX) < area.halfWidth + margin) return area;
      }
    }
    return null;
  }

  /**
   * ¿El vehículo no puede estar en este punto? El agua es infranqueable salvo
   * en los canales someros (`wade`), donde sólo se bloquea si la profundidad
   * supera la que puede vadear la furgoneta.
   *
   * @param {number} margin ensancha la barrera (radio del vehículo) para que
   *   sea el morro, y no el eje, lo que se detenga en la orilla.
   */
  isFlooded(x, z, zoneId = this.zoneId, fromY = 500, margin = 0) {
    const area = this.waterLevelAt(x, z, zoneId, margin);
    if (!area) return false;
    if (!area.wade) return true;
    const ground = this.getGroundHeight(x, z, zoneId, fromY);
    return ground < area.level - (area.depth ?? 0.35);
  }

  /**
   * Altura real del suelo en (x, z) usando **raycasting vertical** sobre la
   * malla del terreno. Si no hay geometría registrada (entornos de test,
   * jsdom) o el rayo no impacta, recurre a la altura analítica `getHeight`.
   *
   * @param {number} x
   * @param {number} z
   * @param {string} zoneId
   * @param {number} [fromY] Altura desde la que partir el rayo. Debe quedar por
   *   encima de la superficie para detectarla correctamente.
   */
  getGroundHeight(x, z, zoneId, fromY = 500) {
    // El relieve se resuelve con el campo de alturas (rápido y exacto) y el
    // raycasting se usa sólo para las estructuras que sobresalen del terreno:
    // rutas elevadas, tableros de puente, rampas y muelles.
    const terrain = this.sampleHeightField(x, z);
    const structure = this.collider.groundHeightAt(x, z, fromY);
    if (terrain === null && structure === null) return this.getHeight(x, z, zoneId);
    if (terrain === null) return structure;
    if (structure === null) return terrain;
    return Math.max(terrain, structure);
  }

  /** ¿Está el punto dentro de una ruta practicable (con margen)? */
  isOnRoute(zoneId, x, z, padding = 0) {
    for (const corridor of ROUTE_CORRIDORS[zoneId] ?? []) {
      const dx = Math.abs(x - corridor.x);
      const dz = Math.abs(z - corridor.z);
      if (corridor.axis === 'z' && dz <= corridor.halfLength && dx <= corridor.halfWidth + padding) return true;
      if (corridor.axis === 'x' && dx <= corridor.halfLength && dz <= corridor.halfWidth + padding) return true;
    }
    if (zoneId === 'montduver') return this.isNearMountainRoute(x, z, padding + 7);
    return false;
  }

  /** Distancia a la pista forestal del Montdúver. */
  isNearMountainRoute(x, z, padding = 8) {
    for (let i = 1; i < MOUNTAIN_ROUTE.length; i += 1) {
      const [ax, az] = MOUNTAIN_ROUTE[i - 1];
      const [bx, bz] = MOUNTAIN_ROUTE[i];
      const dx = bx - ax; const dz = bz - az;
      const denom = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / denom));
      if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < padding) return true;
    }
    return false;
  }

  /**
   * Campo de alturas regular del terreno. Es la misma retícula que la malla,
   * así que la altura del suelo se resuelve por interpolación bilineal en vez
   * de lanzar un rayo contra 16.000 triángulos cada fotograma.
   */
  _buildHeightField(zoneId, size, segments) {
    const step = size / segments;
    const data = new Float32Array((segments + 1) * (segments + 1));
    for (let j = 0; j <= segments; j += 1) {
      for (let i = 0; i <= segments; i += 1) {
        const x = -size / 2 + i * step;
        const z = -size / 2 + j * step;
        data[j * (segments + 1) + i] = this.getHeight(x, z, zoneId);
      }
    }
    this._heightField = { size, segments, step, data };
  }

  /** Altura interpolada del terreno en (x, z), o null si queda fuera. */
  sampleHeightField(x, z) {
    const field = this._heightField;
    if (!field) return null;
    const { size, segments, step, data } = field;
    const fx = (x + size / 2) / step;
    const fz = (z + size / 2) / step;
    if (fx < 0 || fz < 0 || fx > segments || fz > segments) return null;

    const ix = Math.min(segments - 1, Math.floor(fx));
    const iz = Math.min(segments - 1, Math.floor(fz));
    const tx = fx - ix;
    const tz = fz - iz;
    const row = segments + 1;
    const h00 = data[iz * row + ix];
    const h10 = data[iz * row + ix + 1];
    const h01 = data[(iz + 1) * row + ix];
    const h11 = data[(iz + 1) * row + ix + 1];

    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;
    return top + (bottom - top) * tz;
  }

  /** Recoge recursivamente todas las mallas sólidas del grupo de la zona. */
  _collectSolidMeshes(root = this.terrainGroup, out = []) {
    for (const child of root.children) {
      if (child.isMesh && !child.userData.noCollide) out.push(child);
      if (child.children?.length) this._collectSolidMeshes(child, out);
    }
    return out;
  }

  /** (Re)registra las mallas de colisión del terreno en el GroundCollider. */
  _refreshColliders() {
    this.collider.setMeshes(this._collectSolidMeshes());
  }

  /**
   * Pinta el terreno por vértices según el hábitat: humedad cerca del agua,
   * roca en las pendientes fuertes y manchas orgánicas que rompen la
   * repetición del mapa. Es lo que sustituye a la antigua foto de satélite.
   */
  _paintHabitatColors(geometry, zoneId) {
    const position = geometry.attributes.position;
    const palette = GROUND_VERTEX_PALETTES[zoneId] ?? GROUND_VERTEX_PALETTES.marjal;
    const colors = new Float32Array(position.count * 3);
    const sample = new THREE.Vector3();
    const base = new THREE.Color();
    const wet = new THREE.Color();
    const high = new THREE.Color();
    const steep = new THREE.Color();

    base.setRGB(...palette.base);
    wet.setRGB(...palette.wet);
    high.setRGB(...palette.high);
    steep.setRGB(...palette.steep);

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);

      // Pendiente local (diferencia de altura en X y Z).
      const step = 2.5;
      const slope = Math.min(1, (
        Math.abs(this.getHeight(x + step, z, zoneId) - this.getHeight(x - step, z, zoneId))
        + Math.abs(this.getHeight(x, z + step, zoneId) - this.getHeight(x, z - step, zoneId))
      ) / (step * 2.2));

      const area = this.waterLevelAt(x, z, zoneId);
      const wetness = area ? Math.max(0, Math.min(1, (area.level + 1.2 - y) / 2.2)) : 0;
      const altitude = Math.max(0, Math.min(1, (y + 2) / 26));
      const patch = 0.94 + patchNoise(x, z, zoneId === 'montduver' ? 2.3 : 0.7) * 0.09;

      sample.copy(base)
        .lerp(high, altitude * 0.75)
        .lerp(steep, slope * 0.85)
        .lerp(wet, wetness * 0.6)
        .multiplyScalar(patch);

      colors[i * 3] = sample.r;
      colors[i * 3 + 1] = sample.g;
      colors[i * 3 + 2] = sample.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /** Construye la escena 3D completa de la zona elegida */
  buildZone(zoneId) {
    // Limpiar terreno anterior
    this.clear();
    this.zoneId = zoneId;

    const terrainSize = 260;
    const segments = 90;
    const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const py = this.getHeight(px, pz, zoneId);
      pos.setY(i, py);
    }
    geometry.computeVertexNormals();

    // El suelo ya no es la foto de satélite: usa el material propio del
    // hábitat (arena, tierra, hierba, roca…) pintado además por vértices.
    const groundTexture = createGroundTexture(zoneId);
    const style = GROUND_STYLES[zoneId] ?? { repeat: 14, tint: 0xffffff };

    const terrainMat = new THREE.MeshStandardMaterial({
      map: groundTexture,
      bumpMap: groundTexture,
      bumpScale: zoneId === 'montduver' ? 0.4 : 0.16,
      vertexColors: true,
      color: style.tint,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: !!style.flatShading,
      dithering: true,
    });
    this._paintHabitatColors(geometry, zoneId);

    const terrainMesh = new THREE.Mesh(geometry, terrainMat);
    terrainMesh.receiveShadow = true;
    this.terrainGroup.add(terrainMesh);
    // Guardamos la malla principal y su campo de alturas. El relieve se
    // consulta por interpolación bilineal (O(1)) y el raycasting se reserva
    // para las estructuras (rutas, puentes, rampas, tableros).
    this.terrainMesh = terrainMesh;
    terrainMesh.userData.noCollide = true;
    this._buildHeightField(zoneId, terrainSize, segments);

    // Rutas practicables: la única superficie con imagen satelital.
    this.buildRouteNetwork(zoneId);

    // Cuerpos de agua (mar, río, ullals, dársena)
    this.buildWaterBodies(zoneId);

    // Elementos arquitectónicos y singulares de cada zona de Gandía
    this.buildZoneLandmarks(zoneId);

    // Registrar todas las mallas sólidas en el colisionador por raycasting.
    this._refreshColliders();

    return this.terrainGroup;
  }

  /**
   * Construye la red de rutas practicables. Cada tramo conserva la fotografía
   * satelital de la zona (`createSatelliteRouteTexture`), que es la única
   * imagen aérea que sigue usando el mundo 3D.
   */
  buildRouteNetwork(zoneId) {
    if (zoneId === 'platja') {
      this.addRoute(zoneId, { x: -15, z: 0, width: 13, length: 250, elevation: 0.06 });
    } else if (zoneId === 'port') {
      this.addRoute(zoneId, { x: -10, z: 0, width: 14, length: 240, elevation: 0.12 });
    } else if (zoneId === 'marjal') {
      this.addRoute(zoneId, { x: -20, z: 0, width: 11, length: 240, elevation: 0.08, dirt: true });
    } else if (zoneId === 'riu') {
      this.addRoute(zoneId, { x: -35, z: 0, width: 12, length: 230, elevation: 0.08 });
      // Tablero del puente y rampas de acceso (el tablero lo aporta el `.glb`).
      this.addBridgeApproaches(0.82, -1);
    } else if (zoneId === 'casc') {
      this.addRoute(zoneId, { x: 0, z: 0, width: 12, length: 236, elevation: 0.05, lanes: false });
      this.addRoute(zoneId, { x: 0, z: 0, width: 12, length: 236, elevation: 0.07, lanes: false, axis: 'x' });
    } else if (zoneId === 'montduver') {
      this.buildMountainTrail();
    }
  }

  /**
   * Añade un tramo de ruta. `elevation` lo separa del terreno para evitar el
   * z-fighting; el mapa es satelital con la calzada marcada encima.
   */
  addRoute(zoneId, { x, z, width, length, elevation = 0.06, dirt = false, lanes = true, axis = 'z' }) {
    const repeatY = Math.max(2, Math.round(length / 12));
    const texture = createSatelliteRouteTexture(zoneId, { lanes, dirt, repeatY });
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: dirt ? 0.95 : 0.62,
      metalness: 0.05,
      dithering: true,
    });

    const geo = new THREE.PlaneGeometry(width, length, 1, Math.max(2, Math.round(length / 8)));
    geo.rotateX(-Math.PI / 2);
    // El plano sigue el relieve para no quedarse flotando sobre las dunas.
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i += 1) {
      const localX = posAttr.getX(i);
      const localZ = posAttr.getZ(i);
      const worldX = axis === 'x' ? x + localZ : x + localX;
      const worldZ = axis === 'x' ? z - localX : z + localZ;
      posAttr.setY(i, this.getHeight(worldX, worldZ, zoneId) + elevation);
    }
    geo.computeVertexNormals();

    const route = new THREE.Mesh(geo, material);
    route.position.set(x, 0, z);
    if (axis === 'x') route.rotation.y = Math.PI / 2;
    route.receiveShadow = true;
    route.userData.isRoute = true;
    this.terrainGroup.add(route);
    return route;
  }

  /**
   * Rampas de acceso al puente: sin ellas la furgoneta “salta” al tablero.
   * `baseY` es la cota a la que se apoya el modelo (lecho del río).
   */
  addBridgeApproaches(bridgeScale = 0.82, baseY = -1) {
    const deckY = 7.25 * bridgeScale + baseY;
    const halfLength = 23 * bridgeScale;
    const bankY = 1.4;
    const rampLength = 16;
    const rampWidth = 9 * bridgeScale;
    const material = new THREE.MeshStandardMaterial({
      map: createSatelliteRouteTexture('riu', { repeatY: 3 }),
      roughness: 0.7,
      metalness: 0.05,
      dithering: true,
    });

    for (const side of [-1, 1]) {
      const fromX = side * (halfLength + rampLength);
      const toX = side * halfLength;
      const rise = deckY - bankY;
      const length = Math.hypot(rampLength, rise);
      const angle = Math.atan2(rise, rampLength) * side * -1;
      const geo = new THREE.BoxGeometry(length, 0.5, rampWidth);
      const ramp = new THREE.Mesh(geo, material);
      ramp.position.set((fromX + toX) / 2, (bankY + deckY) / 2, 0);
      ramp.rotation.z = angle;
      ramp.receiveShadow = true;
      ramp.userData.isRoute = true;
      this.terrainGroup.add(ramp);
    }
  }

  /** Pista forestal serpenteante de tierra hacia la cumbre. */
  buildMountainTrail() {
    const curve = new THREE.CatmullRomCurve3(
      MOUNTAIN_ROUTE.map(([x, z]) => new THREE.Vector3(x, this.getHeight(x, z, 'montduver'), z)),
    );
    const tubeGeo = new THREE.TubeGeometry(curve, 90, 4.6, 6, false);
    // El tubo es un cilindro: lo aplastamos para que parezca una pista.
    const posAttr = tubeGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i += 1) {
      posAttr.setY(i, posAttr.getY(i) - 2.6);
    }
    tubeGeo.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      map: createSatelliteRouteTexture('montduver', { dirt: true, repeatY: 26 }),
      roughness: 0.95,
      dithering: true,
    });

    const trail = new THREE.Mesh(tubeGeo, material);
    trail.receiveShadow = true;
    trail.userData.isRoute = true;
    this.terrainGroup.add(trail);
  }

  /** Construye cuerpos de agua (mar, río, ullals, dársena) */
  buildWaterBodies(zoneId) {
    const waterMaterial = (color, isSea, repeat = [4, 4]) => new THREE.MeshStandardMaterial({
      map: createWaterTexture(isSea, { repeat }),
      color,
      roughness: 0.22,
      metalness: 0.35,
      transparent: true,
      opacity: 0.9,
      dithering: true,
    });

    if (zoneId === 'platja') {
      // Mar Mediterráneo sobre la orilla de la playa
      const seaGeo = new THREE.PlaneGeometry(120, 300, 24, 40);
      seaGeo.rotateX(-Math.PI / 2);
      const seaMat = waterMaterial(0x2e93a8, true, [6, 12]);
      const sea = new THREE.Mesh(seaGeo, seaMat);
      sea.position.set(116, -0.35, 0);
      sea.userData.noCollide = true;
      this.terrainGroup.add(sea);
      this.waterMeshes.push(sea);
    } else if (zoneId === 'port') {
      // Dársena del puerto de Gandía
      const portWaterGeo = new THREE.PlaneGeometry(140, 160, 20, 24);
      portWaterGeo.rotateX(-Math.PI / 2);
      const portWaterMat = waterMaterial(0x1d5869, true, [5, 6]);
      const water = new THREE.Mesh(portWaterGeo, portWaterMat);
      water.position.set(80, -0.55, 0);
      water.userData.noCollide = true;
      this.terrainGroup.add(water);
      this.waterMeshes.push(water);
    } else if (zoneId === 'marjal') {
      // Ullals de la Marjal
      const ullalGeo = new THREE.PlaneGeometry(32, 48, 12, 16);
      ullalGeo.rotateX(-Math.PI / 2);
      const ullalMat = waterMaterial(0x256658, false, [3, 4]);
      const ullal = new THREE.Mesh(ullalGeo, ullalMat);
      ullal.position.set(30, -0.45, 20);
      ullal.userData.noCollide = true;
      this.terrainGroup.add(ullal);
      this.waterMeshes.push(ullal);
    } else if (zoneId === 'riu') {
      // Río Serpis: sigue el meandro del cauce con una cinta de agua.
      const riverGeo = new THREE.PlaneGeometry(26, 300, 8, 60);
      riverGeo.rotateX(-Math.PI / 2);
      const posAttr = riverGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i += 1) {
        const localZ = posAttr.getZ(i);
        posAttr.setX(i, posAttr.getX(i) + Math.sin(localZ * 0.03) * 8);
      }
      riverGeo.computeVertexNormals();
      const riverMat = waterMaterial(0x31695f, false, [3, 16]);
      const river = new THREE.Mesh(riverGeo, riverMat);
      river.position.set(0, -0.9, 0);
      river.userData.noCollide = true;
      this.terrainGroup.add(river);
      this.waterMeshes.push(river);
    }
  }

  /**
   * Coloca los hitos modelados. La huella de colisión se registra de inmediato
   * (aunque el `.glb` aún esté descargándose) para que la furgoneta no pueda
   * atravesar un edificio.
   */
  buildZoneLandmarks(zoneId) {
    const version = this.zoneVersion;
    const definitions = LANDMARKS[zoneId] ?? [];

    for (const definition of definitions) {
      const y = definition.y ?? this.getHeight(definition.x, definition.z, zoneId);

      if (definition.collide) {
        this.obstacles.add({
          x: definition.x,
          z: definition.z,
          radius: definition.collide.radius * (definition.scale ?? 1),
          height: definition.collide.height * (definition.scale ?? 1),
          type: 'landmark',
        });
      }

      loadLandmark(definition.prop).then((model) => {
        if (!model || version !== this.zoneVersion) return;
        model.position.set(definition.x, y, definition.z);
        model.rotation.y = definition.rotation ?? 0;
        const scale = definition.scale ?? 1;
        model.scale.setScalar(scale);
        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            // La geometría y los materiales proceden de la caché de modelos:
            // se marcan para no liberarlos al cambiar de zona.
            node.userData.sharedModel = true;
            // Las piezas decorativas (pasarelas, pantalanes) no bloquean.
            if (definition.noCollide) node.userData.noCollide = true;
          }
        });
        if (definition.noCollide) model.userData.noCollide = true;
        this.landmarkGroup.add(model);
        // El modelo real aporta geometría pisable (tableros, muelles…).
        if (!definition.noCollide) this._refreshColliders();
      });
    }
  }

  /** Registra obstáculos de atrezo o vegetación en el colisionador. */
  registerObstacles(obstacles = []) {
    return this.obstacles.addMany(obstacles);
  }

  /** Actualización de animaciones de agua en cada fotograma */
  update(delta, time) {
    for (const mesh of this.waterMeshes) {
      if (mesh.material && mesh.material.map) {
        mesh.material.map.offset.x = (time * 0.04) % 1;
        mesh.material.map.offset.y = (time * 0.02) % 1;
      }
    }
  }

  /** Limpia todas las mallas */
  clear() {
    // Invalida cualquier modelo asíncrono de la zona anterior.
    this.zoneVersion += 1;

    while (this.terrainGroup.children.length > 0) {
      const obj = this.terrainGroup.children[0];
      this.terrainGroup.remove(obj);
      disposeObject(obj, true);
    }
    // El grupo de hitos vive dentro de terrainGroup: se restaura vacío.
    this.landmarkGroup = new THREE.Group();
    this.terrainGroup.add(this.landmarkGroup);

    this.waterMeshes = [];
    this.animatedObjects = [];
    this.terrainMesh = null;
    this._heightField = null;
    this.collider.clear();
    this.obstacles.clear();
  }
}

/** Libera geometría y materiales de un subárbol (los compartidos se respetan). */
function disposeObject(object, skipShared) {
  const shared = skipShared
    || object.userData?.sharedVegetation
    || object.userData?.sharedModel
    || object.userData?.sharedProp;
  if (object.geometry && !shared) object.geometry.dispose();
  if (object.material) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      // Los materiales de atrezo viven en la caché de TextureFactory:
      // desecharlos aquí rompería las siguientes zonas.
      if (material?.userData?.shared || shared) continue;
      material.dispose?.();
    }
  }
  for (const child of [...(object.children ?? [])]) disposeObject(child, skipShared);
}
