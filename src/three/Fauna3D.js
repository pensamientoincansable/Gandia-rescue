import * as THREE from 'three';
import { AnimatedEntity } from './AnimatedEntity.js';
import { loadModelsManifest } from './ModelLoader.js';

/**
 * Representación 3D animada de la fauna local de Gandía para rescates.
 * Cada especie (erizo, jabalí, gaviota, conejo, gato, mochuelo, garza, paloma)
 * intenta cargar un modelo 3D detallado (.glb) vía GLTFLoader y se anima con un
 * AnimationMixer (idle/aleteo/andar). Si el modelo no existe, se usa el monigote
 * de primitivas como respaldo. Incluye halo de localización, detección de
 * proximidad y efectos de partículas de cura.
 */

export class Fauna3D {
  constructor(scene, terrainBuilder) {
    this.scene = scene;
    this.terrain = terrainBuilder;
    this.animalsGroup = new THREE.Group();
    this.scene.add(this.animalsGroup);

    this.activeAnimals = [];
    this.particleSystems = [];
  }

  /** Construye los animales para la zona actual */
  buildForZone(zoneId, cases, doneCases) {
    this.clear();

    const zoneCases = cases.filter((c) => c.zone === zoneId);
    for (const cse of zoneCases) {
      const isDone = (doneCases[cse.id] ?? 0) > 0;
      const animal = this.createAnimalMesh(cse.species, cse.id, isDone);

      // Posición basada en los offsets de coordenadas del aviso
      const x = (cse.off[1] * 35000);
      const z = (cse.off[0] * 35000);
      const y = this.terrain.getHeight(x, z, zoneId);

      animal.group.position.set(x, y, z);
      animal.originalY = y;
      animal.caseId = cse.id;
      animal.species = cse.species;
      animal.isDone = isDone;

      this.animalsGroup.add(animal.group);
      this.activeAnimals.push(animal);
    }
  }

  createAnimalMesh(speciesId, caseId, isDone) {
    const group = new THREE.Group();

    // Entidad animada: intenta el modelo GLTF de la especie y, si no, usa el
    // monigote de primitivas como respaldo (AnimationMixer gestiona el reposo).
    const entity = new AnimatedEntity({
      path: null, // se rellena al cargar el manifiesto de modelos
      buildFallback: () => this.buildSpeciesFallback(speciesId),
      motion: 'idle',
    });
    group.add(entity.root);

    // Halo luminoso pulsante de aviso si está pendiente de rescate
    let beacon = null;
    if (!isDone) {
      const haloGeo = new THREE.RingGeometry(1.2, 1.6, 16);
      haloGeo.rotateX(-Math.PI / 2);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xf06f3c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      });
      beacon = new THREE.Mesh(haloGeo, haloMat);
      beacon.position.y = 0.08;
      group.add(beacon);

      // Luz puntual tenue de alerta
      const alertLight = new THREE.PointLight(0xf06f3c, 1.2, 12);
      alertLight.position.y = 1.2;
      group.add(alertLight);
    }

    // Carga asíncrona del modelo detallado de la especie (no bloqueante).
    this._loadAnimalModel(entity, speciesId);

    return { group, entity, mesh: entity.root, beacon, speciesId };
  }

  /** Devuelve el constructor del monigote de respaldo para una especie. */
  buildSpeciesFallback(speciesId) {
    if (speciesId === 'erizo') return this.buildHedgehogMesh();
    if (speciesId === 'jabali') return this.buildBoarMesh();
    if (speciesId === 'gavina') return this.buildSeagullMesh();
    if (speciesId === 'conejo') return this.buildRabbitMesh();
    if (speciesId === 'gato') return this.buildCatMesh();
    if (speciesId === 'mochuelo') return this.buildOwlMesh();
    if (speciesId === 'garza') return this.buildHeronMesh();
    return this.buildPigeonMesh();
  }

  /** Carga el modelo GLTF del animal con sus animaciones (no bloqueante). */
  async _loadAnimalModel(entity, speciesId) {
    try {
      const manifest = await loadModelsManifest();
      const cfg = manifest?.animals?.[speciesId];
      if (!cfg?.path) return;
      entity.setModelSource(cfg.path, cfg.animations ?? {});
    } catch (e) {
      /* mantiene el monigote */
    }
  }

  /* ------------------------------------------------ Modelos 3D por Especie */

  buildHedgehogMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b4c35, roughness: 0.9 });
    const snoutMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.6 });

    // Cuerpo con púas
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), bodyMat);
    body.scale.set(1, 0.8, 1.3);
    body.position.y = 0.45;
    group.add(body);

    // Hocico
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 6), snoutMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.4, 0.65);
    group.add(snout);

    return group;
  }

  buildBoarMesh() {
    const group = new THREE.Group();
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x423124, roughness: 0.95 });
    const tuskMat = new THREE.MeshStandardMaterial({ color: 0xf4f1de, roughness: 0.4 });

    // Tronco
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 2.2), darkMat);
    body.position.y = 1.0;
    group.add(body);

    // Cabeza
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 5), darkMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.9, 1.3);
    group.add(head);

    // Colmillos
    for (const tx of [-0.22, 0.22]) {
      const tusk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.28), tuskMat);
      tusk.position.set(tx, 0.85, 1.4);
      group.add(tusk);
    }

    return group;
  }

  buildSeagullMesh() {
    const group = new THREE.Group();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
    const grayMat = new THREE.MeshStandardMaterial({ color: 0x8d99ae, roughness: 0.6 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfbc531, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 5), whiteMat);
    body.scale.set(0.8, 0.8, 1.4);
    body.position.y = 0.55;
    group.add(body);

    // Alas plegadas
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 1.1), grayMat);
    wingL.position.set(-0.35, 0.6, -0.1);
    group.add(wingL);

    const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 1.1), grayMat);
    wingR.position.set(0.35, 0.6, -0.1);
    group.add(wingR);

    // Pico amarillo
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), yellowMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.62, 0.68);
    group.add(beak);

    return group;
  }

  buildRabbitMesh() {
    const group = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0xc4b59d, roughness: 0.9 });
    const earMat = new THREE.MeshStandardMaterial({ color: 0xddb892, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 6, 6), furMat);
    body.position.y = 0.45;
    group.add(body);

    // Orejas largas erguidas
    for (const ex of [-0.14, 0.14]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.65), earMat);
      ear.position.set(ex, 0.95, 0.1);
      group.add(ear);
    }

    return group;
  }

  buildCatMesh() {
    const group = new THREE.Group();
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xe07a5f, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.9), orangeMat);
    body.position.y = 0.42;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 6), orangeMat);
    head.position.set(0, 0.58, 0.45);
    group.add(head);

    // Cola erguida
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6), orangeMat);
    tail.position.set(0, 0.65, -0.5);
    tail.rotation.x = -0.4;
    group.add(tail);

    return group;
  }

  buildOwlMesh() {
    const group = new THREE.Group();
    const brownMat = new THREE.MeshStandardMaterial({ color: 0x7f5539, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xfec84d, roughness: 0.3, emissive: 0xfec84d, emissiveIntensity: 0.5 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.8, 6), brownMat);
    body.position.y = 0.65;
    group.add(body);

    // Ojos nocturnos grandes
    for (const ox of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
      eye.position.set(ox, 0.85, 0.28);
      group.add(eye);
    }

    return group;
  }

  buildHeronMesh() {
    const group = new THREE.Group();
    const grayMat = new THREE.MeshStandardMaterial({ color: 0xadb5bd, roughness: 0.6 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x495057, roughness: 0.7 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xf39c12, roughness: 0.4 });

    // Cuerpo
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), grayMat);
    body.scale.set(0.7, 0.7, 1.2);
    body.position.y = 1.35;
    group.add(body);

    // Cuello largo en S
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9), grayMat);
    neck.position.set(0, 1.85, 0.35);
    neck.rotation.x = 0.25;
    group.add(neck);

    // Pico largo
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7, 4), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 2.15, 0.75);
    group.add(beak);

    // Patas zancudas largas
    for (const lx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3), legMat);
      leg.position.set(lx, 0.65, 0);
      group.add(leg);
    }

    return group;
  }

  buildPigeonMesh() {
    const group = new THREE.Group();
    const pigeonMat = new THREE.MeshStandardMaterial({ color: 0x6c757d, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), pigeonMat);
    body.position.y = 0.4;
    group.add(body);
    return group;
  }

  /** Lanza partículas mágicas verdes y corazones al rescatar con éxito un animal */
  spawnRescueCelebration(x, y, z) {
    const count = 35;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = x;
      positions[i * 3 + 1] = y + 0.5;
      positions[i * 3 + 2] = z;

      velocities.push(
        (Math.random() - 0.5) * 4,
        2 + Math.random() * 4,
        (Math.random() - 0.5) * 4
      );
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00e676,
      size: 0.4,
      transparent: true,
      opacity: 1,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particleSystems.push({ points, velocities, life: 1.6, age: 0 });
  }

  /** Actualización de animaciones de fauna por fotograma */
  update(delta, time) {
    // Animación de los animales (AnimationMixer o respaldo procedural)
    for (const animal of this.activeAnimals) {
      if (animal.entity) {
        animal.entity.update(delta, time);
      }
      if (animal.beacon) {
        const scale = 1 + Math.sin(time * 4) * 0.2;
        animal.beacon.scale.set(scale, scale, scale);
        animal.beacon.material.opacity = 0.5 + Math.sin(time * 4) * 0.35;
      }
    }

    // Actualización de partículas
    for (let i = this.particleSystems.length - 1; i >= 0; i--) {
      const ps = this.particleSystems[i];
      ps.age += delta;
      const progress = ps.age / ps.life;
      if (progress >= 1) {
        this.scene.remove(ps.points);
        ps.points.geometry.dispose();
        ps.points.material.dispose();
        this.particleSystems.splice(i, 1);
        continue;
      }

      const pos = ps.points.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.setX(j, pos.getX(j) + ps.velocities[j * 3] * delta);
        pos.setY(j, pos.getY(j) + (ps.velocities[j * 3 + 1] - 3.5 * ps.age) * delta);
        pos.setZ(j, pos.getZ(j) + ps.velocities[j * 3 + 2] * delta);
      }
      pos.needsUpdate = true;
      ps.points.material.opacity = 1 - progress;
    }
  }

  /** Encuentra el animal más cercano dentro del radio de rescate */
  getNearestAnimal(pos, maxDist = 7) {
    let nearest = null;
    let minDist = Infinity;
    for (const animal of this.activeAnimals) {
      const dist = pos.distanceTo(animal.group.position);
      if (dist < minDist && dist <= maxDist) {
        minDist = dist;
        nearest = { ...animal, distance: dist };
      }
    }
    return nearest;
  }

  clear() {
    while (this.animalsGroup.children.length > 0) {
      const obj = this.animalsGroup.children[0];
      this.animalsGroup.remove(obj);
    }
    this.activeAnimals = [];
  }
}
