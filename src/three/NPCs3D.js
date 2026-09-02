import * as THREE from 'three';
import { AnimatedEntity } from './AnimatedEntity.js';
import { loadModelsManifest } from './ModelLoader.js';

/**
 * Lugareños y personajes 3D de Gandía (NPCs).
 * Cada zona cuenta con un habitante autóctono con el que podemos hablar
 * para descubrir la historia, tradiciones y secretos del lugar, así como
 * recibir pistas de conservación sobre la fauna en peligro.
 *
 * Los humanos se cargan con un modelo 3D detallado (.glb) vía GLTFLoader y se
 * animan con un AnimationMixer (idle / walk / talk). Si el modelo no está
 * disponible, se usa el monigote de primitivas como respaldo.
 */

export const NPCS_DATA = {
  platja: {
    id: 'vicent',
    name: 'Vicent el Socorrista',
    role: 'Socorrista de la Platja Nord',
    coords: { x: 26, z: 12 },
    icon: '🛟',
    outfit: { shirt: 0xe63946, pants: 0xf4f1de, hat: 0xe63946 },
    topics: ['historia_playa', 'tortugas_dunas', 'pista_erizo'],
  },
  port: {
    id: 'manolo',
    name: 'Tío Manolo el Pescador',
    role: 'Pescador veterano del Grau de Gandía',
    coords: { x: 20, z: -35 },
    icon: '⚓',
    outfit: { shirt: 0x1d3557, pants: 0x457b9d, hat: 0x2b2d42 },
    topics: ['historia_grau', 'lonja_pesca', 'pista_gaviota'],
  },
  marjal: {
    id: 'sento',
    name: "Sento l'Arrosser",
    role: 'Agricultor tradicional de la Marjal',
    coords: { x: -35, z: 15 },
    icon: '🌾',
    outfit: { shirt: 0x588157, pants: 0x3a5a40, hat: 0xd4a373 },
    topics: ['historia_ullals', 'arroz_safor', 'pista_jabali'],
  },
  riu: {
    id: 'carmen',
    name: 'Carmen la Biòloga',
    role: 'Ecóloga de la cuenca del Serpis',
    coords: { x: -20, z: -15 },
    icon: '🔬',
    outfit: { shirt: 0xa3b18a, pants: 0x344e41, hat: 0x588157 },
    topics: ['historia_serpis', 'corredor_fluvial', 'pista_conejo'],
  },
  casc: {
    id: 'francesc',
    name: 'Don Francesc el Cronista',
    role: 'Historiador de la Gandía Ducal',
    coords: { x: -16, z: -8 },
    icon: '📜',
    outfit: { shirt: 0x4a4e69, pants: 0x22223b, hat: 0x9a8c98 },
    topics: ['historia_borja', 'colegiata_palau', 'pista_gato'],
  },
  montduver: {
    id: 'neus',
    name: 'Neus la Guarda Forestal',
    role: 'Agente medioambiental del Montdúver',
    coords: { x: -10, z: -12 },
    icon: '🌲',
    outfit: { shirt: 0x2d6a4f, pants: 0x1b4332, hat: 0x40916c },
    topics: ['historia_montduver', 'rapaces_nocturnas', 'pista_mochuelo'],
  },
};

export class NPCs3D {
  constructor(scene, terrainBuilder) {
    this.scene = scene;
    this.terrain = terrainBuilder;
    this.npcsGroup = new THREE.Group();
    this.scene.add(this.npcsGroup);

    this.activeNpc = null;
  }

  /** Genera el lugareño correspondiente a la zona */
  buildForZone(zoneId) {
    this.clear();
    const data = NPCS_DATA[zoneId];
    if (!data) return;

    const group = new THREE.Group();
    const x = data.coords.x;
    const z = data.coords.z;
    const y = this.terrain.getGroundHeight
      ? this.terrain.getGroundHeight(x, z, zoneId, 500)
      : this.terrain.getHeight(x, z, zoneId);

    // Personaje 3D animado: intenta cargar el humano detallado (GLTF +
    // AnimationMixer) y, si no, usa el monigote de primitivas como respaldo.
    const character = new AnimatedEntity({
      path: null, // se rellena al cargar el manifiesto de modelos
      buildFallback: () => this.buildCharacterMesh(data.outfit),
      motion: 'idle',
    });
    group.add(character.root);

    // Indicador flotante "Hablar" / icono de diálogo
    const talkIcon = this.createTalkBadge();
    talkIcon.position.y = 2.4;
    group.add(talkIcon);

    group.position.set(x, y, z);
    this.npcsGroup.add(group);

    this.activeNpc = {
      group,
      character,
      talkIcon,
      data,
      zoneId,
    };

    // Carga asíncrona del modelo humano detallado del manifiesto.
    this._loadNpcModel(this.activeNpc);
  }

  /** Carga el modelo GLTF del humano con sus animaciones (no bloqueante). */
  async _loadNpcModel(npc) {
    try {
      const manifest = await loadModelsManifest();
      const cfg = manifest?.npc;
      if (!cfg?.path) return;
      // Intercambia en caliente el monigote por el humano detallado + mixer.
      await npc.character.setModelSource(cfg.path, cfg.animations ?? {});
    } catch (e) {
      /* mantiene el monigote */
    }
  }

  buildCharacterMesh(outfit) {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5cba7, roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: outfit.shirt, roughness: 0.7 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: outfit.pants, roughness: 0.8 });
    const hatMat = new THREE.MeshStandardMaterial({ color: outfit.hat, roughness: 0.7 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 });

    // Torso / Camisa
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.4), shirtMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);

    // Cabeza
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), skinMat);
    head.position.y = 1.72;
    group.add(head);

    // Sombrero / Gorra
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.22, 8), hatMat);
    hat.position.y = 1.92;
    group.add(hat);

    // Piernas / Pantalones
    for (const lx of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.28), pantsMat);
      leg.position.set(lx, 0.45, 0);
      group.add(leg);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.38), shoeMat);
      shoe.position.set(lx, 0.08, 0.06);
      group.add(shoe);
    }

    // Brazos
    for (const ax of [-0.44, 0.44]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.22), shirtMat);
      arm.position.set(ax, 1.15, 0);
      group.add(arm);
    }

    return group;
  }

  createTalkBadge() {
    const group = new THREE.Group();

    // Círculo brillante
    const circle = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 16),
      new THREE.MeshBasicMaterial({ color: 0x00a88f, side: THREE.DoubleSide })
    );
    group.add(circle);

    // Borde blanco
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.42, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    group.add(ring);

    return group;
  }

  /** Actualización de animación por fotograma */
  update(time, camera, delta = 1 / 60) {
    if (!this.activeNpc) return;

    // El badge de diálogo siempre mira hacia la cámara
    if (this.activeNpc.talkIcon && camera) {
      this.activeNpc.talkIcon.lookAt(camera.position);
      const floatY = 2.4 + Math.sin(time * 3) * 0.12;
      this.activeNpc.talkIcon.position.y = floatY;
    }

    // Avanza el AnimationMixer (o la animación procedural de respaldo).
    if (this.activeNpc.character) {
      this.activeNpc.character.update(delta, time);
    }
  }

  /** Comprueba si el jugador/furgoneta está cerca del lugareño */
  getNearbyNpc(pos, maxDist = 6) {
    if (!this.activeNpc) return null;
    const dist = pos.distanceTo(this.activeNpc.group.position);
    if (dist <= maxDist) {
      return { ...this.activeNpc.data, distance: dist };
    }
    return null;
  }

  clear() {
    while (this.npcsGroup.children.length > 0) {
      const obj = this.npcsGroup.children[0];
      this.npcsGroup.remove(obj);
    }
    this.activeNpc = null;
  }
}
