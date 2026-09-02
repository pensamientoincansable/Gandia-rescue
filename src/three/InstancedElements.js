import * as THREE from 'three';
import { addInstancedVegetation } from './VegetationLibrary.js';

/**
 * Gestor de elementos instanciados mediante InstancedMesh / InstancedBufferGeometry.
 * Mantiene los carrizos, rocas y mobiliario en pocas llamadas de dibujo y usa
 * los FBX texturizados de /media para árboles y arbustos. De este modo se
 * sustituyen las antiguas copas cónicas que parecían sombrillas por siluetas
 * de vegetación real sin cerrar ni desplazar las rutas transitables.
 */

export class InstancedElements {
  constructor(scene, terrainBuilder) {
    this.scene = scene;
    this.terrain = terrainBuilder;
    this.instancedGroup = new THREE.Group();
    this.scene.add(this.instancedGroup);

    this.reedMesh = null;
    this.reedOriginalPos = null;
    this.instancedMeshes = [];
    // Token de generación: impide que una carga FBX de una zona abandonada se
    // añada después de viajar a otra localización.
    this.zoneBuildVersion = 0;
  }

  /** Construye la vegetación y elementos instanciados estratégicos para la zona */
  buildForZone(zoneId) {
    this.clear();

    if (zoneId === 'platja') {
      this.buildBeachElements();
    } else if (zoneId === 'port') {
      this.buildPortElements();
    } else if (zoneId === 'marjal') {
      this.buildMarjalElements();
    } else if (zoneId === 'riu') {
      this.buildRiverElements();
    } else if (zoneId === 'casc') {
      this.buildHistoricCityElements();
    } else if (zoneId === 'montduver') {
      this.buildMountainElements();
    }
  }

  /** Añade un conjunto de FBX cuando su plantilla y atlas PNG estén listos. */
  queueTexturedVegetation(assetId, placements, zoneId) {
    const version = this.zoneBuildVersion;
    addInstancedVegetation(
      assetId,
      placements,
      this.instancedGroup,
      (x, z) => this.terrain.getHeight(x, z, zoneId),
      () => version === this.zoneBuildVersion,
    ).then((mesh) => {
      if (mesh && version === this.zoneBuildVersion) this.instancedMeshes.push(mesh);
    });
  }

  /** Distribución ordenada y determinista para no invadir la calzada. */
  treeLine({ x, fromZ, toZ, step, wobble = 0.7, scale = 1, rotationOffset = 0 }) {
    const placements = [];
    let index = 0;
    for (let z = fromZ; z <= toZ; z += step) {
      placements.push({
        x: x + Math.sin(index * 1.73 + rotationOffset) * wobble,
        z,
        scale: scale * (0.82 + (index % 5) * 0.075),
        rotation: (index * 2.399 + rotationOffset) % (Math.PI * 2),
      });
      index += 1;
    }
    return placements;
  }

  /** Distancia a la pista forestal dibujada por TerrainBuilder. */
  isNearMountainRoute(x, z, padding = 8) {
    const route = [[-70, -70], [-40, -20], [10, -40], [35, 10], [0, 0]];
    for (let i = 1; i < route.length; i += 1) {
      const [ax, az] = route[i - 1];
      const [bx, bz] = route[i];
      const dx = bx - ax; const dz = bz - az;
      const denom = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / denom));
      if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < padding) return true;
    }
    return false;
  }

  /* ------------------------------------------------ Platja de Gandía */
  buildBeachElements() {
    // Tamarindos y árboles de paseo FBX. Se sitúan fuera de la calzada de
    // x=-15 (ancho 10), dejando la ruta costera completamente legible.
    this.queueTexturedVegetation('coastalTall', [
      ...this.treeLine({ x: -29, fromZ: -108, toZ: 108, step: 12, wobble: 1.1, scale: 1.04 }),
      ...this.treeLine({ x: 3, fromZ: -102, toZ: 102, step: 16, wobble: 1.4, scale: 0.82, rotationOffset: 0.8 }),
    ], 'platja');
    this.queueTexturedVegetation('bush', this.treeLine({ x: 26, fromZ: -104, toZ: 104, step: 10, wobble: 2.2, scale: 0.48 }), 'platja');

    // Sombrillas auténticas de playa, espaciadas y agrupadas en arena: no son
    // árboles ni bloquean el paseo ni la vista de la furgoneta.
    this.createInstancedUmbrellas(48, 'platja');

    // Hierbas de dunas (marram grass / borró) (400 mechones)
    this.createInstancedDuneGrass(400, 'platja');

    // Farolas del paseo marítimo (40 farolas)
    this.createInstancedStreetLamps(-8.5, -110, 110, 12, 'platja');
  }

  /* ------------------------------------------------ Port de Gandía */
  buildPortElements() {
    // 1. Bolardos de amarre de muelle (80 bolardos)
    this.createInstancedBollards(80, 'port');

    // 2. Cajas de pesca y contenedores marítimos (120 cajas)
    this.createInstancedCrates(120, 'port');

    // 3. Farolas industriales de muelle (30 farolas)
    this.createInstancedStreetLamps(-4, -90, 90, 14, 'port', 0x34495e);

    // Arbolado del Grau con modelos FBX, retirado de la vía de acceso x=-10.
    this.queueTexturedVegetation('urban', this.treeLine({ x: -27, fromZ: -94, toZ: 94, step: 13, wobble: 1.1, scale: 0.88 }), 'port');
    this.queueTexturedVegetation('coastal', this.treeLine({ x: 12, fromZ: -86, toZ: 86, step: 18, wobble: 1.5, scale: 0.72, rotationOffset: 1.2 }), 'port');
  }

  /* ------------------------------------------------ Marjal de Gandía */
  buildMarjalElements() {
    // 1. Carrizal denso (Phragmites australis) utilizando InstancedBufferGeometry: 3.200 carrizos
    this.createInstancedReeds(3200, 'marjal');

    // 2. Huerta periférica: árboles FBX con copas irregulares. Las filas quedan
    // al oeste del camino rural de x=-20 para no romper la disposición de ruta.
    const orchard = [];
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 11; col += 1) {
        orchard.push({
          x: -82 + col * 4.45 + Math.sin(row * 7 + col) * 0.38,
          z: -58 + row * 20 + Math.cos(row * 3 + col) * 0.55,
          scale: 0.72 + ((row + col) % 4) * 0.075,
          rotation: (row * 0.91 + col * 1.73) % (Math.PI * 2),
        });
      }
    }
    this.queueTexturedVegetation('orchard', orchard, 'marjal');
    this.queueTexturedVegetation('orchardTall', this.treeLine({ x: -92, fromZ: -98, toZ: 98, step: 17, wobble: 1.8, scale: 0.95 }), 'marjal');
    this.queueTexturedVegetation('bushFlower', this.treeLine({ x: 18, fromZ: -82, toZ: 82, step: 12, wobble: 3.8, scale: 0.42, rotationOffset: 0.3 }), 'marjal');

    // 3. Lirios de agua y flores silvestres (250 flores)
    this.createInstancedFlowers(250, 'marjal');
  }

  /* ------------------------------------------------ Riu Serpis */
  buildRiverElements() {
    // Álamos y sauces de ribera FBX. Se mantienen fuera del cauce (≈ |x|<14)
    // y de la carretera de ribera x=-35 para que agua y ruta sigan visibles.
    const leftBank = this.treeLine({ x: -24, fromZ: -104, toZ: 104, step: 11, wobble: 2.3, scale: 0.95 });
    const rightBank = this.treeLine({ x: 25, fromZ: -100, toZ: 100, step: 12, wobble: 2.1, scale: 1.02, rotationOffset: 1.1 });
    this.queueTexturedVegetation('riparian', leftBank, 'riu');
    this.queueTexturedVegetation('riverShade', rightBank, 'riu');
    this.queueTexturedVegetation('bushFlower', [
      ...this.treeLine({ x: -16.5, fromZ: -92, toZ: 92, step: 13, wobble: 0.8, scale: 0.42 }),
      ...this.treeLine({ x: 16.5, fromZ: -86, toZ: 86, step: 14, wobble: 0.7, scale: 0.42, rotationOffset: 2 }),
    ], 'riu');

    // 2. Cantos rodados y piedras del lecho fluvial (450 rocas)
    this.createInstancedRiverBoulders(450, 'riu');

    // 3. Adelfas / Baladres con flores rosas (160 arbustos)
    this.createInstancedOleanders(160, 'riu');
  }

  /* ------------------------------------------------ Centre Històric */
  buildHistoricCityElements() {
    // 1. Farolas históricas de forja (40 farolas ornamentales)
    this.createInstancedStreetLamps(-18, -80, 80, 14, 'casc', 0x2c2c2c, true);
    this.createInstancedStreetLamps(18, -80, 80, 14, 'casc', 0x2c2c2c, true);

    // 2. Jardineras y arbolado con los modelos suministrados. Se reservan las
    // dos vías adoquinadas de x=0 y z=0, con plaza y acceso despejados.
    const planters = [];
    for (let i = 0; i < 28; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -68 + Math.floor(i / 2) * 10.3;
      if (Math.abs(z) < 12) continue;
      planters.push({ x: side * 26, z, scale: 0.64 + (i % 3) * 0.08, rotation: i * 1.7 });
    }
    this.createInstancedPlanterBases(planters, 'casc');
    this.queueTexturedVegetation('urban', planters, 'casc');
    this.queueTexturedVegetation('urbanTall', this.treeLine({ x: -52, fromZ: -85, toZ: 85, step: 20, wobble: 1.2, scale: 0.92 }), 'casc');

    // 3. Bancos de piedra histórica (35 bancos)
    this.createInstancedStoneBenches(35, 'casc');
  }

  /* ------------------------------------------------ Montdúver */
  buildMountainElements() {
    // Pinos carrascos FBX de silueta irregular. La selección por distancia deja
    // ocho metros libres a ambos lados de la pista forestal serpenteante.
    const nearRoute = (x, z) => this.isNearMountainRoute(x, z, 8);
    const pines = [];
    for (let i = 0; i < 132; i += 1) {
      const ring = 24 + (i % 48) * 1.75;
      const angle = i * 2.399963229728653;
      const x = Math.cos(angle) * ring;
      const z = Math.sin(angle) * ring;
      if (!nearRoute(x, z) && Math.hypot(x, z) > 16) {
        pines.push({ x, z, scale: 0.74 + (i % 6) * 0.085, rotation: angle + Math.PI / 2 });
      }
    }
    this.queueTexturedVegetation('pine', pines.filter((_, i) => i % 3 === 0), 'montduver');
    this.queueTexturedVegetation('pineTall', pines.filter((_, i) => i % 3 === 1), 'montduver');
    this.queueTexturedVegetation('pineDark', pines.filter((_, i) => i % 3 === 2), 'montduver');
    this.queueTexturedVegetation('pineSilver', this.treeLine({ x: -96, fromZ: -105, toZ: 105, step: 18, wobble: 3, scale: 0.72 }), 'montduver');
    this.queueTexturedVegetation('bushDark', pines.filter((_, i) => i % 5 === 0).map((p) => ({ ...p, scale: p.scale * 0.36 })), 'montduver');

    // 2. Rocas y canchales de piedra caliza (320 rocas escarpadas)
    this.createInstancedLimestoneRocks(320, 'montduver');

    // 3. Matorrales de romero y tomillo (400 matas aromáticas)
    this.createInstancedMountainShrubs(400, 'montduver');
  }

  /* ------------------------------------------------ Creadores de InstancedMesh */


  createInstancedReeds(count, zoneId) {
    // Tallo de carrizo con espiga terminal
    const reedGeo = new THREE.CylinderGeometry(0.04, 0.08, 2.8, 4);
    reedGeo.translate(0, 1.4, 0);

    const reedMat = new THREE.MeshStandardMaterial({
      color: 0x5a8a3a,
      roughness: 0.8,
      flatShading: true,
    });

    const mesh = new THREE.InstancedMesh(reedGeo, reedMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      // Distribución natural alrededor de los canales y charcas
      const angle = (i / count) * Math.PI * 20;
      const radius = 10 + (i % 60) * 1.5;
      const x = Math.sin(angle) * radius + (Math.sin(i) * 15);
      const z = Math.cos(angle) * radius + (Math.cos(i) * 15);
      const y = this.terrain.getHeight(x, z, zoneId);

      const s = 0.7 + (i % 10) * 0.07;
      dummy.position.set(x, y, z);
      dummy.rotation.y = (i * 0.3) % (Math.PI * 2);
      dummy.rotation.x = Math.sin(i * 0.4) * 0.15;
      dummy.rotation.z = Math.cos(i * 0.4) * 0.15;
      dummy.scale.set(s, s * 1.2, s);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
    this.reedMesh = mesh;
  }



  createInstancedUmbrellas(count, zoneId) {
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5);
    poleGeo.translate(0, 1.3, 0);
    const topGeo = new THREE.ConeGeometry(1.6, 0.6, 7);
    topGeo.translate(0, 2.6, 0);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd6cbb5 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x2288a8, roughness: 0.6 });

    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const topMesh = new THREE.InstancedMesh(topGeo, topMat, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const x = 16 + (i % 8) * 4.2 + (Math.sin(i) * 1.2);
      const z = -90 + Math.floor(i / 8) * 9.5;
      const y = this.terrain.getHeight(x, z, zoneId);

      dummy.position.set(x, y, z);
      dummy.rotation.y = i * 0.4;
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();

      poleMesh.setMatrixAt(i, dummy.matrix);
      topMesh.setMatrixAt(i, dummy.matrix);
    }

    poleMesh.instanceMatrix.needsUpdate = true;
    topMesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(poleMesh, topMesh);
    this.instancedMeshes.push(poleMesh, topMesh);
  }

  createInstancedDuneGrass(count, zoneId) {
    const grassGeo = new THREE.ConeGeometry(0.3, 1.1, 4);
    grassGeo.translate(0, 0.55, 0);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x98a86a, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(grassGeo, grassMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = 2 + (i % 20) * 1.8 + Math.sin(i) * 2;
      const z = -100 + (i / count) * 200;
      const y = this.terrain.getHeight(x, z, zoneId);

      dummy.position.set(x, y, z);
      dummy.rotation.y = i * 0.8;
      const s = 0.6 + (i % 6) * 0.12;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  createInstancedStreetLamps(x, startZ, endZ, step, zoneId, color = 0x333333, historic = false) {
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 5, 6);
    poleGeo.translate(0, 2.5, 0);
    const lanternGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
    lanternGeo.translate(0, 5.2, 0);

    const poleMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 });
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffe6a3,
      emissive: 0xffbb44,
      emissiveIntensity: 0.6,
    });

    const count = Math.floor((endZ - startZ) / step) + 1;
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMat, count);

    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let z = startZ; z <= endZ; z += step) {
      const y = this.terrain.getHeight(x, z, zoneId);
      dummy.position.set(x, y, z);
      dummy.updateMatrix();

      poleMesh.setMatrixAt(idx, dummy.matrix);
      lanternMesh.setMatrixAt(idx, dummy.matrix);
      idx++;
    }

    poleMesh.instanceMatrix.needsUpdate = true;
    lanternMesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(poleMesh, lanternMesh);
    this.instancedMeshes.push(poleMesh, lanternMesh);
  }

  createInstancedBollards(count, zoneId) {
    const geo = new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8);
    geo.translate(0, 0.4, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.3 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const z = -80 + (i / count) * 160;
      const x = 24.5;
      const y = this.terrain.getHeight(x, z, zoneId);

      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  createInstancedCrates(count, zoneId) {
    const geo = new THREE.BoxGeometry(1.6, 1.2, 1.4);
    geo.translate(0, 0.6, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d708f, roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = 8 + (i % 6) * 2.5;
      const z = -60 + (i / count) * 120;
      const y = this.terrain.getHeight(x, z, zoneId);

      dummy.position.set(x, y, z);
      dummy.rotation.y = (i * 0.4) % Math.PI;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }


  createInstancedFlowers(count, zoneId) {
    const geo = new THREE.DodecahedronGeometry(0.25);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4d03f, roughness: 0.6 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const angle = i * 0.4;
      const dist = 10 + (i % 40) * 1.5;
      const x = Math.sin(angle) * dist;
      const z = Math.cos(angle) * dist;
      const y = this.terrain.getHeight(x, z, zoneId) + 0.15;

      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  createInstancedRiverBoulders(count, zoneId) {
    const geo = new THREE.DodecahedronGeometry(0.8, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8479, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = -8 + (i % 16) * 1.1 + (Math.sin(i) * 1.2);
      const z = -100 + (i / count) * 200;
      const y = this.terrain.getHeight(x, z, zoneId) + 0.2;

      dummy.position.set(x, y, z);
      dummy.rotation.set(i, i * 2, i * 0.5);
      const s = 0.5 + (i % 7) * 0.15;
      dummy.scale.set(s * 1.2, s * 0.6, s);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  createInstancedOleanders(count, zoneId) {
    const geo = new THREE.SphereGeometry(1.2, 5, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x567d46, roughness: 0.8 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (8 + (i % 8) * 1.4);
      const z = -90 + (i / count) * 180;
      const y = this.terrain.getHeight(x, z, zoneId) + 0.5;

      dummy.position.set(x, y, z);
      dummy.scale.set(1.2, 1, 1.2);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  /** Bases de terracota para el arbolado FBX del casco histórico. */
  createInstancedPlanterBases(placements, zoneId) {
    if (!placements?.length) return;
    const potGeo = new THREE.CylinderGeometry(0.82, 0.58, 0.8, 8);
    potGeo.translate(0, 0.4, 0);
    const rimGeo = new THREE.TorusGeometry(0.79, 0.09, 5, 8);
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.translate(0, 0.79, 0);
    const potMat = new THREE.MeshStandardMaterial({ color: 0xb85f37, roughness: 0.86, flatShading: true });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd18757, roughness: 0.78, flatShading: true });
    const potMesh = new THREE.InstancedMesh(potGeo, potMat, placements.length);
    const rimMesh = new THREE.InstancedMesh(rimGeo, rimMat, placements.length);
    const dummy = new THREE.Object3D();

    placements.forEach((placement, index) => {
      const y = this.terrain.getHeight(placement.x, placement.z, zoneId);
      dummy.position.set(placement.x, y, placement.z);
      dummy.rotation.y = placement.rotation ?? 0;
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      potMesh.setMatrixAt(index, dummy.matrix);
      rimMesh.setMatrixAt(index, dummy.matrix);
    });

    potMesh.instanceMatrix.needsUpdate = true;
    rimMesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(potMesh, rimMesh);
    this.instancedMeshes.push(potMesh, rimMesh);
  }

  createInstancedStoneBenches(count, zoneId) {
    const benchGeo = new THREE.BoxGeometry(2.4, 0.5, 0.8);
    benchGeo.translate(0, 0.35, 0);
    const benchMat = new THREE.MeshStandardMaterial({ color: 0xa8a092, roughness: 0.8 });
    const mesh = new THREE.InstancedMesh(benchGeo, benchMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * 14;
      const z = -55 + (i / count) * 110;
      const y = this.terrain.getHeight(x, z, zoneId);

      dummy.position.set(x, y, z);
      dummy.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  createInstancedLimestoneRocks(count, zoneId) {
    const geo = new THREE.DodecahedronGeometry(1.6, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9f9a8d, roughness: 0.95, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    let placed = 0;
    for (let i = 0; placed < count && i < count * 3; i += 1) {
      const dist = 10 + (i % 60) * 1.4;
      const angle = (i * 137.5) * (Math.PI / 180);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      // También los canchales respetan la anchura transitable de la pista.
      if (zoneId === 'montduver' && this.isNearMountainRoute(x, z, 6.5)) continue;
      const y = this.terrain.getHeight(x, z, zoneId) + 0.4;

      dummy.position.set(x, y, z);
      dummy.rotation.set(i * 0.3, i * 0.5, i * 0.2);
      const s = 0.8 + (i % 5) * 0.3;
      dummy.scale.set(s, s * 0.8, s * 1.2);
      dummy.updateMatrix();

      mesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  createInstancedMountainShrubs(count, zoneId) {
    const geo = new THREE.SphereGeometry(0.8, 5, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4f6b3e, roughness: 0.85 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    let placed = 0;
    for (let i = 0; placed < count && i < count * 3; i += 1) {
      const dist = 14 + (i % 70) * 1.3;
      const angle = (i * 97.3) * (Math.PI / 180);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (zoneId === 'montduver' && this.isNearMountainRoute(x, z, 5.4)) continue;
      const y = this.terrain.getHeight(x, z, zoneId) + 0.3;

      dummy.position.set(x, y, z);
      const s = 0.7 + (i % 4) * 0.2;
      dummy.scale.set(s * 1.2, s * 0.6, s * 1.2);
      dummy.updateMatrix();

      mesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  /** Animación sutil de viento en carrizos y vegetación */
  update(time) {
    // Si hay carrizos, podemos oscilar sutilmente su inclinación si se requiere
  }

  /** Limpieza de mallas */
  clear() {
    // Invalida cualquier promesa de carga de FBX aún pendiente.
    this.zoneBuildVersion += 1;
    while (this.instancedGroup.children.length > 0) {
      const obj = this.instancedGroup.children[0];
      this.instancedGroup.remove(obj);
      // Las plantillas de vegetación comparten geometría/material cacheados
      // entre zonas; liberarlos aquí rompería el siguiente viaje.
      if (!obj.userData.sharedVegetation && obj.geometry) obj.geometry.dispose();
      if (!obj.userData.sharedVegetation && obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    }
    this.instancedMeshes = [];
    this.reedMesh = null;
  }
}
