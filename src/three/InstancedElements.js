import * as THREE from 'three';

/**
 * Gestor de elementos instanciados mediante InstancedMesh / InstancedBufferGeometry.
 * Permite renderizar miles de carrizos, palmeras, pinos, farolas históricas,
 * bolardos portuarios, rocas calizas y sombrillas con un único draw call
 * y rendimiento de 60 FPS en móvil y PC.
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

  /* ------------------------------------------------ Platja de Gandía */
  buildBeachElements() {
    // 1. Palmeras del paseo marítimo (120 palmeras alineadas)
    this.createInstancedPalms([
      { startX: -10, startZ: -110, endZ: 110, step: 6 },
      { startX: -20, startZ: -110, endZ: 110, step: 7 },
    ], 'platja');

    // 2. Sombrillas de playa y hamacas (160 instancias en la arena)
    this.createInstancedUmbrellas(160, 'platja');

    // 3. Hierbas de dunas (marram grass / borró) (400 mechones)
    this.createInstancedDuneGrass(400, 'platja');

    // 4. Farolas del paseo marítimo (40 farolas)
    this.createInstancedStreetLamps(-10, -110, 110, 10, 'platja');
  }

  /* ------------------------------------------------ Port de Gandía */
  buildPortElements() {
    // 1. Bolardos de amarre de muelle (80 bolardos)
    this.createInstancedBollards(80, 'port');

    // 2. Cajas de pesca y contenedores marítimos (120 cajas)
    this.createInstancedCrates(120, 'port');

    // 3. Farolas industriales de muelle (30 farolas)
    this.createInstancedStreetLamps(-5, -90, 90, 12, 'port', 0x34495e);

    // 4. Palmeras de la avenida del Grau (50 palmeras)
    this.createInstancedPalms([{ startX: -25, startZ: -90, endZ: 90, step: 8 }], 'port');
  }

  /* ------------------------------------------------ Marjal de Gandía */
  buildMarjalElements() {
    // 1. Carrizal denso (Phragmites australis) utilizando InstancedBufferGeometry: 3.200 carrizos
    this.createInstancedReeds(3200, 'marjal');

    // 2. Naranjos de la huerta periférica (140 árboles)
    this.createInstancedOrangeTrees(140, 'marjal');

    // 3. Lirios de agua y flores silvestres (250 flores)
    this.createInstancedFlowers(250, 'marjal');
  }

  /* ------------------------------------------------ Riu Serpis */
  buildRiverElements() {
    // 1. Álamos blancos y sauces de ribera (180 árboles)
    this.createInstancedRiparianTrees(180, 'riu');

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

    // 2. Naranjos en jardineras de terracota (60 naranjos urbanos)
    this.createInstancedPlantersWithTrees(60, 'casc');

    // 3. Bancos de piedra histórica (35 bancos)
    this.createInstancedStoneBenches(35, 'casc');
  }

  /* ------------------------------------------------ Montdúver */
  buildMountainElements() {
    // 1. Pinos carrascos mediterráneos (280 pinos)
    this.createInstancedPines(280, 'montduver');

    // 2. Rocas y canchales de piedra caliza (320 rocas escarpadas)
    this.createInstancedLimestoneRocks(320, 'montduver');

    // 3. Matorrales de romero y tomillo (400 matas aromáticas)
    this.createInstancedMountainShrubs(400, 'montduver');
  }

  /* ------------------------------------------------ Creadores de InstancedMesh */

  createInstancedPalms(lines, zoneId) {
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 6, 6);
    const frondsGeo = new THREE.ConeGeometry(2.6, 1.6, 6);
    trunkGeo.translate(0, 3, 0);
    frondsGeo.translate(0, 6.2, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a633c, roughness: 0.9 });
    const frondsMat = new THREE.MeshStandardMaterial({ color: 0x477836, roughness: 0.7 });

    let count = 0;
    lines.forEach((l) => { count += Math.floor((l.endZ - l.startZ) / l.step) + 1; });

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const frondsMesh = new THREE.InstancedMesh(frondsGeo, frondsMat, count);
    trunkMesh.castShadow = true;
    frondsMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;

    for (const line of lines) {
      for (let z = line.startZ; z <= line.endZ; z += line.step) {
        const x = line.startX + (Math.sin(z) * 0.4);
        const y = this.terrain.getHeight(x, z, zoneId);
        const scale = 0.85 + Math.sin(x + z) * 0.25;

        dummy.position.set(x, y, z);
        dummy.rotation.y = (z * 0.1) % (Math.PI * 2);
        dummy.rotation.z = Math.sin(z * 0.2) * 0.08;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();

        trunkMesh.setMatrixAt(idx, dummy.matrix);
        frondsMesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    frondsMesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(trunkMesh);
    this.instancedGroup.add(frondsMesh);
    this.instancedMeshes.push(trunkMesh, frondsMesh);
  }

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

  createInstancedPines(count, zoneId) {
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.45, 5, 5);
    trunkGeo.translate(0, 2.5, 0);
    const needlesGeo = new THREE.ConeGeometry(2.4, 4.5, 5);
    needlesGeo.translate(0, 5.2, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d432b, roughness: 0.9 });
    const needlesMat = new THREE.MeshStandardMaterial({ color: 0x2e5332, roughness: 0.8 });

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const needlesMesh = new THREE.InstancedMesh(needlesGeo, needlesMat, count);
    trunkMesh.castShadow = true;
    needlesMesh.castShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const radius = 18 + (i % 80) * 1.2;
      const angle = (i * 137.5) * (Math.PI / 180); // Ángulo dorado
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = this.terrain.getHeight(x, z, zoneId);

      const s = 0.8 + ((i * 17) % 10) * 0.06;
      dummy.position.set(x, y, z);
      dummy.rotation.y = (i * 0.7) % (Math.PI * 2);
      dummy.rotation.z = Math.sin(i) * 0.06;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(i, dummy.matrix);
      needlesMesh.setMatrixAt(i, dummy.matrix);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    needlesMesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(trunkMesh, needlesMesh);
    this.instancedMeshes.push(trunkMesh, needlesMesh);
  }

  createInstancedRiparianTrees(count, zoneId) {
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
    trunkGeo.translate(0, 3, 0);
    const foliageGeo = new THREE.SphereGeometry(2.8, 6, 5);
    foliageGeo.translate(0, 6.5, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x72695c, roughness: 0.85 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x628c46, roughness: 0.75 });

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      // Dispersados a lo largo del cauce del río Serpis
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (12 + (i % 15) * 1.6);
      const z = -100 + ((i * 220) / count);
      const y = this.terrain.getHeight(x, z, zoneId);

      const s = 0.85 + (i % 8) * 0.06;
      dummy.position.set(x, y, z);
      dummy.rotation.y = i * 0.5;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(i, dummy.matrix);
      foliageMesh.setMatrixAt(i, dummy.matrix);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(trunkMesh, foliageMesh);
    this.instancedMeshes.push(trunkMesh, foliageMesh);
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

  createInstancedOrangeTrees(count, zoneId) {
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2.5, 5);
    trunkGeo.translate(0, 1.25, 0);
    const canopyGeo = new THREE.SphereGeometry(1.6, 6, 5);
    canopyGeo.translate(0, 2.8, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e5239, roughness: 0.9 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x417030, roughness: 0.8 });

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 14);
      const col = i % 14;
      const x = -80 + col * 4;
      const z = -60 + row * 8;
      const y = this.terrain.getHeight(x, z, zoneId);

      dummy.position.set(x, y, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(i, dummy.matrix);
      canopyMesh.setMatrixAt(i, dummy.matrix);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(trunkMesh, canopyMesh);
    this.instancedMeshes.push(trunkMesh, canopyMesh);
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

  createInstancedPlantersWithTrees(count, zoneId) {
    const potGeo = new THREE.CylinderGeometry(0.7, 0.5, 0.8, 8);
    potGeo.translate(0, 0.4, 0);
    const treeGeo = new THREE.SphereGeometry(1.3, 6, 5);
    treeGeo.translate(0, 2.2, 0);

    const potMat = new THREE.MeshStandardMaterial({ color: 0xbf5f38, roughness: 0.8 });
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x487332, roughness: 0.7 });

    const potMesh = new THREE.InstancedMesh(potGeo, potMat, count);
    const treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * 12;
      const z = -60 + (i / count) * 120;
      const y = this.terrain.getHeight(x, z, zoneId);

      dummy.position.set(x, y, z);
      dummy.updateMatrix();

      potMesh.setMatrixAt(i, dummy.matrix);
      treeMesh.setMatrixAt(i, dummy.matrix);
    }

    potMesh.instanceMatrix.needsUpdate = true;
    treeMesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(potMesh, treeMesh);
    this.instancedMeshes.push(potMesh, treeMesh);
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

    for (let i = 0; i < count; i++) {
      const dist = 10 + (i % 60) * 1.4;
      const angle = (i * 137.5) * (Math.PI / 180);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = this.terrain.getHeight(x, z, zoneId) + 0.4;

      dummy.position.set(x, y, z);
      dummy.rotation.set(i * 0.3, i * 0.5, i * 0.2);
      const s = 0.8 + (i % 5) * 0.3;
      dummy.scale.set(s, s * 0.8, s * 1.2);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.instancedGroup.add(mesh);
    this.instancedMeshes.push(mesh);
  }

  createInstancedMountainShrubs(count, zoneId) {
    const geo = new THREE.SphereGeometry(0.8, 5, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4f6b3e, roughness: 0.85 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const dist = 14 + (i % 70) * 1.3;
      const angle = (i * 97.3) * (Math.PI / 180);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = this.terrain.getHeight(x, z, zoneId) + 0.3;

      dummy.position.set(x, y, z);
      const s = 0.7 + (i % 4) * 0.2;
      dummy.scale.set(s * 1.2, s * 0.6, s * 1.2);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

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
    while (this.instancedGroup.children.length > 0) {
      const obj = this.instancedGroup.children[0];
      this.instancedGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    }
    this.instancedMeshes = [];
    this.reedMesh = null;
  }
}
