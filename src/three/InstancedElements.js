import * as THREE from 'three';
import { addInstancedVegetation } from './VegetationLibrary.js';
import { addInstancedProp, PROP_TEMPLATES } from './PropsLibrary.js';

/**
 * Gestor de la vegetación y del atrezo de cada localización.
 *
 * Todo lo que antes eran primitivas sin textura (dodecaedros como rocas,
 * esferas como adelfas, conos como hierba, cajas como contenedores) se
 * sustituye por:
 *
 *   · **Vegetación modelada**: los FBX de `media/models` (23 árboles y 8
 *     arbustos) con su atlas alfa, reutilizados también como carrizos, matas y
 *     flores mediante escalado no uniforme.
 *   · **Atrezo modelado**: piezas de `PropsLibrary` (rocas con ruido de
 *     vértices, farolas, bolardos, cajas, bancos, jardineras, sombrillas…)
 *     construidas con varias partes y materiales con mapa.
 *
 * Cada elemento se dibuja con `InstancedMesh` y registra su huella en el
 * `ObstacleCollider` del terreno para que la furgoneta choque con él.
 */

/** Generador pseudoaleatorio determinista: el paisaje no cambia entre cargas. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class InstancedElements {
  constructor(scene, terrainBuilder) {
    this.scene = scene;
    this.terrain = terrainBuilder;
    this.instancedGroup = new THREE.Group();
    this.scene.add(this.instancedGroup);

    this.instancedMeshes = [];
    // Token de generación: impide que una carga FBX/GLB de una zona
    // abandonada se añada después de viajar a otra localización.
    this.zoneBuildVersion = 0;
    this.zoneId = null;
  }

  /** Construye la vegetación y elementos instanciados estratégicos para la zona */
  buildForZone(zoneId) {
    this.clear();
    this.zoneId = zoneId;

    if (zoneId === 'platja') this.buildBeachElements();
    else if (zoneId === 'port') this.buildPortElements();
    else if (zoneId === 'marjal') this.buildMarjalElements();
    else if (zoneId === 'riu') this.buildRiverElements();
    else if (zoneId === 'casc') this.buildHistoricCityElements();
    else if (zoneId === 'montduver') this.buildMountainElements();
  }

  /* ------------------------------------------------------------ utilidades */

  /** Registra la huella de colisión de una lista de obstáculos. */
  _register(obstacles) {
    if (!obstacles?.length) return;
    this.terrain?.registerObstacles?.(obstacles);
  }

  /**
   * Añade una familia de vegetación modelada (FBX + atlas) y registra sus
   * troncos como obstáculos cuando la plantilla termina de cargar.
   */
  queueTexturedVegetation(assetId, placements, zoneId, options = {}) {
    const version = this.zoneBuildVersion;
    const isCurrent = () => version === this.zoneBuildVersion;
    addInstancedVegetation(
      assetId,
      placements,
      this.instancedGroup,
      (x, z) => this.terrain.getHeight(x, z, zoneId),
      isCurrent,
      { onColliders: (colliders) => { if (isCurrent()) this._register(colliders); } },
    ).then((mesh) => {
      if (mesh && isCurrent()) this.instancedMeshes.push(mesh);
    });
  }

  /**
   * Añade atrezo modelado e instanciado y registra sus colisiones.
   * El radio de colisión sale de la propia pieza (`PROP_TEMPLATES`), así que
   * el vehículo choca con la farola, no con una caja imaginaria.
   */
  addProps(propId, placements, zoneId, { colliders = true, collideScale = 1 } = {}) {
    if (!placements?.length) return [];
    const heightAt = (x, z) => this.terrain.getHeight(x, z, zoneId);
    const meshes = addInstancedProp(propId, placements, this.instancedGroup, heightAt);
    this.instancedMeshes.push(...meshes);

    const template = PROP_TEMPLATES[propId];
    if (colliders && template?.collide) {
      this._register(placements.map((placement) => {
        const scale = Array.isArray(placement.scale) ? Math.max(...placement.scale) : (placement.scale ?? 1);
        return {
          x: placement.x,
          z: placement.z,
          radius: (placement.collideRadius ?? template.collide.radius) * scale * collideScale,
          height: (placement.collideHeight ?? template.collide.height) * scale,
          soft: placement.soft ?? false,
          type: 'prop',
        };
      }));
    }
    return meshes;
  }

  /** Distribución ordenada y determinista para no invadir la calzada. */
  treeLine({ x, fromZ, toZ, step, wobble = 0.7, scale = 1, rotationOffset = 0, zToX = false }) {
    const placements = [];
    let index = 0;
    for (let t = fromZ; t <= toZ; t += step) {
      const offset = Math.sin(index * 1.73 + rotationOffset) * wobble;
      const scaleFactor = scale * (0.82 + (index % 5) * 0.075);
      placements.push(zToX
        ? { x: t, z: x + offset, scale: scaleFactor, rotation: (index * 2.399 + rotationOffset) % (Math.PI * 2) }
        : { x: x + offset, z: t, scale: scaleFactor, rotation: (index * 2.399 + rotationOffset) % (Math.PI * 2) });
      index += 1;
    }
    return placements;
  }

  /** ¿El punto está sobre una ruta practicable (con margen)? */
  _onRoute(x, z, padding = 2) {
    return !!this.terrain?.isOnRoute?.(this.zoneId, x, z, padding);
  }

  /** ¿El punto está bajo el agua? (evita plantar árboles en el cauce) */
  _flooded(x, z) {
    return !!this.terrain?.isFlooded?.(x, z, this.zoneId);
  }

  /**
   * Dispersión determinista de puntos con rechazo de rutas, agua y solapes.
   * `test` adicional permite afinar la colocación por zona.
   */
  scatter({
    count, seed = 1, minX = -110, maxX = 110, minZ = -110, maxZ = 110,
    routePadding = 2.5, avoidWater = true, minGap = 2.2, test = null, tries = 6,
  }) {
    const random = mulberry32(seed);
    const points = [];
    let attempts = 0;
    while (points.length < count && attempts < count * tries) {
      attempts += 1;
      const x = minX + random() * (maxX - minX);
      const z = minZ + random() * (maxZ - minZ);
      if (routePadding > 0 && this._onRoute(x, z, routePadding)) continue;
      if (avoidWater && this._flooded(x, z)) continue;
      if (test && !test(x, z)) continue;
      let tooClose = false;
      for (const point of points) {
        if (Math.hypot(point.x - x, point.z - z) < minGap) { tooClose = true; break; }
      }
      if (tooClose) continue;
      points.push({ x, z, scale: 0.8 + random() * 0.5, rotation: random() * Math.PI * 2 });
    }
    return points;
  }

  /* ------------------------------------------------ Platja de Gandía */

  buildBeachElements() {
    // Arbolado del paseo marítimo (tras la calzada de x=-15).
    this.queueTexturedVegetation('coastalTall',
      this.treeLine({ x: -30, fromZ: -110, toZ: 110, step: 11, wobble: 1.1, scale: 1.02 }), 'platja');
    this.queueTexturedVegetation('coastal',
      this.treeLine({ x: -40, fromZ: -100, toZ: 100, step: 17, wobble: 2.4, scale: 0.86, rotationOffset: 0.9 }), 'platja');
    this.queueTexturedVegetation('silverFoliage',
      this.treeLine({ x: -52, fromZ: -96, toZ: 96, step: 23, wobble: 3.2, scale: 0.8, rotationOffset: 2.1 }), 'platja');

    // Mata de dunas (borró) reutilizando los arbustos FBX, achatados.
    const duneGrass = this.scatter({
      count: 240, seed: 12, minX: -6, maxX: 46, minZ: -104, maxZ: 104, minGap: 1.5, routePadding: 3,
    }).map((p) => ({ ...p, scale: [0.55 + p.scale * 0.35, 0.28, 0.55 + p.scale * 0.35], soft: true }));
    this.queueTexturedVegetation('bushDry', duneGrass, 'platja');

    // Sombrillas modeladas en la arena, agrupadas y fuera del paseo.
    const umbrellas = [];
    const random = mulberry32(7);
    for (let row = 0; row < 12; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const x = 17 + col * 6.4 + Math.sin(row * 1.7 + col) * 1.1;
        const z = -88 + row * 15.5 + (random() - 0.5) * 3.2;
        if (this._onRoute(x, z, 3)) continue;
        umbrellas.push({ x, z, scale: 0.95 + random() * 0.25, rotation: random() * Math.PI * 2, collideRadius: 1.9, collideHeight: 2.6 });
      }
    }
    this.addProps('umbrella', umbrellas, 'platja');

    // Mobiliario del paseo: farolas, bancos y señales.
    this.addProps('streetLamp', this.treeLine({ x: -23.5, fromZ: -104, toZ: 104, step: 18, wobble: 0.4, scale: 1 })
      .map((p) => ({ ...p, scale: 1, collideRadius: 0.5, collideHeight: 5 })), 'platja');
    this.addProps('bench', this.treeLine({ x: -25.5, fromZ: -96, toZ: 96, step: 34, wobble: 0.3, scale: 1 })
      .map((p) => ({ ...p, rotation: Math.PI / 2, scale: 1, collideRadius: 1.4, collideHeight: 1.1 })), 'platja');
    this.addProps('signPost', [
      { x: -23, z: -70, scale: 1, collideRadius: 0.3, collideHeight: 2.4 },
      { x: -23, z: 66, scale: 1, collideRadius: 0.3, collideHeight: 2.4 },
    ], 'platja');

    // Escollera de la orilla: rocas modeladas, no dodecaedros en crudo.
    const groyne = this.scatter({
      count: 46, seed: 33, minX: 47, maxX: 60, minZ: -100, maxZ: 100, minGap: 3.4, routePadding: 0, avoidWater: false,
    }).map((p) => ({ ...p, scale: 0.7 + p.scale * 0.9, collideRadius: 1.5, collideHeight: 2.2 }));
    this.addProps('rock', groyne, 'platja');
  }

  /* ------------------------------------------------ Port de Gandía */

  buildPortElements() {
    // Bolardos de amarre a lo largo del cantil del muelle.
    const bollards = [];
    for (let z = -76; z <= 76; z += 6.5) {
      bollards.push({ x: 24.2, z, scale: 1, collideRadius: 0.35, collideHeight: 0.9 });
    }
    this.addProps('bollard', bollards, 'port');

    // Cajas de pesca y contenedores agrupados en la zona de lonja.
    const crates = this.scatter({
      count: 54, seed: 21, minX: 2, maxX: 21, minZ: -70, maxZ: 70, minGap: 2.4, routePadding: 2,
    }).map((p) => ({ ...p, scale: 0.85 + p.scale * 0.4, collideRadius: 0.9, collideHeight: 1.4 }));
    this.addProps('crate', crates, 'port');
    const fishBoxes = this.scatter({
      count: 40, seed: 22, minX: 6, maxX: 23, minZ: -66, maxZ: 66, minGap: 1.8, routePadding: 2,
    }).map((p) => ({ ...p, scale: 0.9 + p.scale * 0.5, collideRadius: 0.6, collideHeight: 0.7 }));
    this.addProps('fishBox', fishBoxes, 'port');

    // Farolas industriales de muelle.
    this.addProps('streetLamp', this.treeLine({ x: -19, fromZ: -92, toZ: 92, step: 20, wobble: 0.3, scale: 1 })
      .map((p) => ({ ...p, collideRadius: 0.5, collideHeight: 5 })), 'port');

    // Arbolado del Grau, retirado de la vía de acceso (x=-10).
    this.queueTexturedVegetation('urban',
      this.treeLine({ x: -28, fromZ: -96, toZ: 96, step: 13, wobble: 1.2, scale: 0.9 }), 'port');
    this.queueTexturedVegetation('coastal',
      this.treeLine({ x: -42, fromZ: -88, toZ: 88, step: 20, wobble: 2.6, scale: 0.78, rotationOffset: 1.2 }), 'port');
    this.queueTexturedVegetation('bushRock', this.scatter({
      count: 40, seed: 44, minX: -38, maxX: -22, minZ: -80, maxZ: 80, minGap: 2.6,
    }).map((p) => ({ ...p, scale: [0.5, 0.42, 0.5], soft: true })), 'port');

    // Defensas de piedra al pie del dique.
    this.addProps('rock', this.scatter({
      count: 38, seed: 51, minX: 26, maxX: 44, minZ: -74, maxZ: 74, minGap: 4, routePadding: 0, avoidWater: false,
    }).map((p) => ({ ...p, scale: 0.8 + p.scale * 0.8, collideRadius: 1.5, collideHeight: 2.2 })), 'port');
  }

  /* ------------------------------------------------ Marjal de Gandía */

  buildMarjalElements() {
    // Carrizal denso: los arbustos FBX escalados en vertical hacen de
    // carrizos (Phragmites) sin añadir geometría nueva.
    const reedBeds = this.scatter({
      count: 520, seed: 5, minX: -12, maxX: 52, minZ: -104, maxZ: 104, minGap: 1.3, routePadding: 2.5, avoidWater: false,
      test: (x, z) => {
        const canal = Math.sin(z * 0.06) * 12;
        const nearCanal = Math.abs(x - canal) < 16;
        const nearUllal = Math.hypot(x - 30, z - 20) < 34;
        return nearCanal || nearUllal;
      },
    }).map((p) => ({ ...p, scale: [0.4 + p.scale * 0.22, 1.5 + p.scale * 0.6, 0.4 + p.scale * 0.22], soft: true }));
    this.queueTexturedVegetation('bushDense', reedBeds, 'marjal');

    // Huerta de cítricos al oeste del camino rural.
    const orchard = [];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 11; col += 1) {
        const x = -98 + col * 5.2 + Math.sin(row * 7 + col) * 0.5;
        const z = -66 + row * 20 + Math.cos(row * 3 + col) * 0.7;
        if (this._onRoute(x, z, 3)) continue;
        orchard.push({
          x,
          z,
          scale: 0.74 + ((row + col) % 4) * 0.08,
          rotation: (row * 0.91 + col * 1.73) % (Math.PI * 2),
        });
      }
    }
    this.queueTexturedVegetation('citrus', orchard, 'marjal');
    this.queueTexturedVegetation('citrusSmall',
      this.treeLine({ x: -104, fromZ: -100, toZ: 100, step: 16, wobble: 2.6, scale: 0.86 }), 'marjal');
    this.queueTexturedVegetation('olive',
      this.treeLine({ x: -8, fromZ: -104, toZ: 104, step: 26, wobble: 3.4, scale: 0.8, rotationOffset: 2.4 }), 'marjal');

    // Flores y lirios de agua en las orillas encharcadas.
    this.queueTexturedVegetation('bushFlower', this.scatter({
      count: 150, seed: 9, minX: -14, maxX: 14, minZ: -90, maxZ: 90, minGap: 1.6,
    }).map((p) => ({ ...p, scale: [0.45 + p.scale * 0.2, 0.3, 0.45 + p.scale * 0.2], soft: true })), 'marjal');

    // Muretes de piedra seca entre bancales y cantos de los caminos.
    this.addProps('dryStoneWall', this.treeLine({ x: -32, fromZ: -84, toZ: 84, step: 46, wobble: 1.4, scale: 1 })
      .map((p) => ({ ...p, scale: 1, collideRadius: 1.5, collideHeight: 1.5 })), 'marjal');
    this.addProps('pebble', this.scatter({
      count: 70, seed: 15, minX: -30, maxX: 12, minZ: -96, maxZ: 96, minGap: 1.2,
    }).map((p) => ({ ...p, scale: 0.6 + p.scale * 0.6 })), 'marjal', { colliders: false });
  }

  /* ------------------------------------------------ Riu Serpis */

  buildRiverElements() {
    // Soto de ribera: álamos y sauces modelados, fuera del cauce y de la vía.
    this.queueTexturedVegetation('poplar',
      this.treeLine({ x: -25, fromZ: -106, toZ: 106, step: 12, wobble: 2.1, scale: 0.96 }), 'riu');
    this.queueTexturedVegetation('riparian',
      this.treeLine({ x: -47, fromZ: -100, toZ: 100, step: 18, wobble: 3, scale: 0.84, rotationOffset: 1.4 }), 'riu');
    this.queueTexturedVegetation('poplarBroad',
      this.treeLine({ x: 26, fromZ: -102, toZ: 102, step: 14, wobble: 2.4, scale: 1.02, rotationOffset: 1.1 }), 'riu');
    this.queueTexturedVegetation('willow',
      this.treeLine({ x: 40, fromZ: -96, toZ: 96, step: 22, wobble: 3.2, scale: 0.92, rotationOffset: 2.2 }), 'riu');

    // Adelfas / baladres en flor sobre los taludes.
    this.queueTexturedVegetation('bushBroom',
      this.scatter({
        count: 120, seed: 27, minX: -22, maxX: -15, minZ: -100, maxZ: 100, minGap: 2, avoidWater: false,
      }).map((p) => ({ ...p, scale: [0.55 + p.scale * 0.2, 0.5, 0.55 + p.scale * 0.2], soft: true })), 'riu');
    this.queueTexturedVegetation('bushRock',
      this.scatter({
        count: 110, seed: 28, minX: 15, maxX: 22, minZ: -100, maxZ: 100, minGap: 2, avoidWater: false,
      }).map((p) => ({ ...p, scale: [0.5 + p.scale * 0.2, 0.46, 0.5 + p.scale * 0.2], soft: true })), 'riu');

    // Carrizos en las orillas del meandro.
    const reeds = [];
    for (let z = -104; z <= 104; z += 2.4) {
      const riverX = Math.sin(z * 0.03) * 8;
      for (const side of [-1, 1]) {
        const x = riverX + side * (12.5 + Math.sin(z * 0.21 + side) * 1.6);
        if (this._onRoute(x, z, 2.5)) continue;
        if (Math.abs(x) < 6.5) continue; // tablero del puente
        reeds.push({ x, z, scale: [0.42, 1.55, 0.42], rotation: z * 0.7, soft: true });
      }
    }
    this.queueTexturedVegetation('bushDense', reeds, 'riu');

    // Cantos rodados del lecho: rocas modeladas y achatadas, sin geometría cruda.
    const stones = this.scatter({
      count: 160, seed: 31, minX: -13, maxX: 13, minZ: -110, maxZ: 110, minGap: 1.4, routePadding: 0, avoidWater: false,
      test: (x, z) => {
        const riverX = Math.sin(z * 0.03) * 8;
        return Math.abs(x - riverX) < 13;
      },
    }).map((p) => ({ ...p, scale: 0.7 + p.scale * 1.1 }));
    this.addProps('riverStone', stones, 'riu', { colliders: false });

    // Rocas mayores en los márgenes del cauce.
    this.addProps('rock', this.scatter({
      count: 34, seed: 34, minX: -20, maxX: 20, minZ: -100, maxZ: 100, minGap: 5, avoidWater: false,
      test: (x, z) => {
        const riverX = Math.sin(z * 0.03) * 8;
        const distance = Math.abs(x - riverX);
        return distance > 13 && distance < 17;
      },
    }).map((p) => ({ ...p, scale: 0.9 + p.scale * 0.9, collideRadius: 1.5, collideHeight: 2.2 })), 'riu');

    // Banco y señal junto al puente.
    this.addProps('bench', [
      { x: -25, z: -14, rotation: Math.PI / 2, scale: 1, collideRadius: 1.4, collideHeight: 1.1 },
      { x: -25, z: 14, rotation: -Math.PI / 2, scale: 1, collideRadius: 1.4, collideHeight: 1.1 },
    ], 'riu');
    this.addProps('signPost', [
      { x: -25, z: -30, scale: 1, collideRadius: 0.3, collideHeight: 2.4 },
      { x: -25, z: 30, scale: 1, rotation: Math.PI, collideRadius: 0.3, collideHeight: 2.4 },
    ], 'riu');
  }

  /* ------------------------------------------------ Centre Històric */

  buildHistoricCityElements() {
    // Arbolado de alineación con jardinera de terracota, en los cuatro
    // cuadrantes de la plaza, respetando las dos vías adoquinadas.
    const planters = [];
    const lines = [
      { axis: 'z', at: -15, from: -76, to: 76, step: 11 },
      { axis: 'z', at: 15, from: -76, to: 76, step: 11 },
      { axis: 'x', at: -15, from: -76, to: 76, step: 11 },
      { axis: 'x', at: 15, from: -76, to: 76, step: 11 },
    ];
    for (const line of lines) {
      let index = 0;
      for (let t = line.from; t <= line.to; t += line.step) {
        const other = line.at + Math.sin(index * 1.9) * 0.6;
        const x = line.axis === 'z' ? other : t;
        const z = line.axis === 'z' ? t : other;
        if (this._onRoute(x, z, 3)) { index += 1; continue; }
        planters.push({ x, z, scale: 0.92 + (index % 3) * 0.06, rotation: index * 1.7 });
        index += 1;
      }
    }
    this.addProps('planter', planters.map((p) => ({ ...p, collideRadius: 1, collideHeight: 1.2 })), 'casc');
    this.queueTexturedVegetation('urban', planters, 'casc');
    this.queueTexturedVegetation('urbanTall',
      this.treeLine({ x: -54, fromZ: -88, toZ: 88, step: 19, wobble: 1.6, scale: 0.94 }), 'casc');
    this.queueTexturedVegetation('autumnRed', [
      { x: 34, z: -52, scale: 0.9, rotation: 0.4 },
      { x: 38, z: 46, scale: 0.86, rotation: 2.1 },
    ], 'casc');

    // Farolas históricas de forja y bancos de piedra.
    this.addProps('historicLamp', [
      ...this.treeLine({ x: -9.5, fromZ: -78, toZ: 78, step: 17, wobble: 0.2, scale: 1 }).filter((p) => Math.abs(p.z) > 10),
      ...this.treeLine({ x: 9.5, fromZ: -78, toZ: 78, step: 17, wobble: 0.2, scale: 1 }).filter((p) => Math.abs(p.z) > 10),
      ...this.treeLine({ x: -78, fromZ: -70, toZ: 70, step: 17, wobble: 0.2, scale: 1, zToX: true }).filter((p) => Math.abs(p.x) > 10),
      ...this.treeLine({ x: 78, fromZ: -70, toZ: 70, step: 17, wobble: 0.2, scale: 1, zToX: true }).filter((p) => Math.abs(p.x) > 10),
    ].map((p) => ({ ...p, scale: 1, collideRadius: 0.5, collideHeight: 4.4 })), 'casc');

    this.addProps('bench', [
      ...this.treeLine({ x: -13, fromZ: -64, toZ: 64, step: 22, wobble: 0.2, scale: 1 }),
      ...this.treeLine({ x: 13, fromZ: -64, toZ: 64, step: 22, wobble: 0.2, scale: 1 }),
    ]
      // Se apartan del cruce de las dos vías adoquinadas.
      .filter((p) => Math.abs(p.z) > 10)
      .map((p) => ({ ...p, rotation: Math.PI / 2, scale: 1, collideRadius: 1.4, collideHeight: 1.1 })), 'casc');

    // Setos bajos recortados en el perímetro de la plaza.
    this.queueTexturedVegetation('bushDark', this.scatter({
      count: 60, seed: 63, minX: -40, maxX: 40, minZ: -40, maxZ: 40, minGap: 2.6,
      test: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 19,
    }).map((p) => ({ ...p, scale: [0.5, 0.4, 0.5], soft: true })), 'casc');
  }

  /* ------------------------------------------------ Montdúver */

  buildMountainElements() {
    const nearRoute = (x, z) => this.terrain?.isNearMountainRoute?.(x, z, 9) ?? false;

    // Pinar de varias especies: se respeta un pasillo de 9 m a cada lado de la
    // pista forestal para que siga siendo transitable.
    const pines = this.scatter({
      count: 210, seed: 71, minX: -108, maxX: 108, minZ: -108, maxZ: 108, minGap: 4.2, routePadding: 0,
      test: (x, z) => !nearRoute(x, z) && Math.hypot(x, z) > 18,
    });
    this.queueTexturedVegetation('pine', pines.filter((_, i) => i % 4 === 0)
      .map((p) => ({ ...p, scale: 0.8 + p.scale * 0.35 })), 'montduver');
    this.queueTexturedVegetation('pineTall', pines.filter((_, i) => i % 4 === 1)
      .map((p) => ({ ...p, scale: 0.78 + p.scale * 0.32 })), 'montduver');
    this.queueTexturedVegetation('pineDark', pines.filter((_, i) => i % 4 === 2)
      .map((p) => ({ ...p, scale: 0.82 + p.scale * 0.34 })), 'montduver');
    this.queueTexturedVegetation('pineBroad', pines.filter((_, i) => i % 4 === 3)
      .map((p) => ({ ...p, scale: 0.74 + p.scale * 0.3 })), 'montduver');
    this.queueTexturedVegetation('juniper', this.scatter({
      count: 46, seed: 74, minX: -100, maxX: 100, minZ: -100, maxZ: 100, minGap: 5, routePadding: 0,
      test: (x, z) => !nearRoute(x, z) && Math.hypot(x, z) < 46 && Math.hypot(x, z) > 20,
    }).map((p) => ({ ...p, scale: 0.85 + p.scale * 0.3 })), 'montduver');

    // Matorral aromático (romero, tomillo) y lastón.
    this.queueTexturedVegetation('bush', this.scatter({
      count: 260, seed: 77, minX: -106, maxX: 106, minZ: -106, maxZ: 106, minGap: 2.6, routePadding: 0,
      test: (x, z) => !nearRoute(x, z),
    }).map((p) => ({ ...p, scale: [0.55 + p.scale * 0.25, 0.5, 0.55 + p.scale * 0.25], soft: true })), 'montduver');
    this.queueTexturedVegetation('bushEmber', this.scatter({
      count: 90, seed: 78, minX: -100, maxX: 100, minZ: -100, maxZ: 100, minGap: 3, routePadding: 0,
      test: (x, z) => !nearRoute(x, z),
    }).map((p) => ({ ...p, scale: [0.5 + p.scale * 0.2, 0.34, 0.5 + p.scale * 0.2], soft: true })), 'montduver');

    // Canchales y rocas de piedra caliza modeladas.
    this.addProps('rock', this.scatter({
      count: 120, seed: 81, minX: -104, maxX: 104, minZ: -104, maxZ: 104, minGap: 4.5, routePadding: 0,
      test: (x, z) => !nearRoute(x, z),
    }).map((p) => ({ ...p, scale: 0.7 + p.scale * 0.9, collideRadius: 1.5, collideHeight: 2.2 })), 'montduver');
    this.addProps('boulder', this.scatter({
      count: 44, seed: 83, minX: -96, maxX: 96, minZ: -96, maxZ: 96, minGap: 12, routePadding: 0,
      test: (x, z) => !nearRoute(x, z) && Math.hypot(x, z) > 26,
    }).map((p) => ({ ...p, scale: 0.8 + p.scale * 0.7, collideRadius: 2.1, collideHeight: 3 })), 'montduver');
    this.addProps('pebble', this.scatter({
      count: 130, seed: 85, minX: -102, maxX: 102, minZ: -102, maxZ: 102, minGap: 1.6, routePadding: 0,
      test: (x, z) => !nearRoute(x, z),
    }).map((p) => ({ ...p, scale: 0.5 + p.scale * 0.7 })), 'montduver', { colliders: false });

    // Muretes de piedra seca entre bancales: siempre lejos de la pista para
    // no cerrar el único acceso rodado a la cumbre.
    this.addProps('dryStoneWall', this.scatter({
      count: 9, seed: 91, minX: -100, maxX: 100, minZ: -100, maxZ: 100, minGap: 20, routePadding: 0,
      test: (x, z) => !nearRoute(x, z, 13),
    }).map((p) => ({ ...p, scale: 1, collideRadius: 1.5, collideHeight: 1.5 })), 'montduver');
  }

  /** Animación sutil de viento en carrizos y vegetación */
  update(time) {
    // La vegetación se instancia de forma estática; el vaivén se reserva para
    // las copas de los modelos animados de fauna y NPCs.
  }

  /** Limpieza de mallas */
  clear() {
    // Invalida cualquier promesa de carga de FBX/GLB aún pendiente.
    this.zoneBuildVersion += 1;
    while (this.instancedGroup.children.length > 0) {
      const obj = this.instancedGroup.children[0];
      this.instancedGroup.remove(obj);
      // Las plantillas de vegetación y atrezo comparten geometría/material
      // cacheados entre zonas; liberarlos aquí rompería el siguiente viaje.
      const shared = obj.userData.sharedVegetation || obj.userData.sharedProp;
      if (!shared && obj.geometry) obj.geometry.dispose();
      if (!shared && obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    }
    this.instancedMeshes = [];
  }
}
