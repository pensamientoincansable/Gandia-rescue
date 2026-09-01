import * as THREE from 'three';

/**
 * Pistas de rastreo y secretos medioambientales en 3D para cada zona de Gandía.
 * Los guardias pueden encontrar huellas, restos de sedales, plumas y marcas
 * en el terreno que orientan hacia el animal en apuros y aportan datos educativos.
 */

export const CLUES_DATA = {
  platja: [
    {
      id: 'clue_platja_huellas',
      title: 'Huellas diminutas en la arena',
      desc: 'Pequeñas marcas de cinco dedos con almohadillas redondeadas. Un erizo ha cruzado desde el paseo hacia la vegetación dunar.',
      coords: { x: 14, z: 28 },
      icon: '🐾',
    },
    {
      id: 'clue_platja_duna',
      title: 'Rama de borró aplastada',
      desc: 'El matorral dunar muestra signos de paso reciente. Hay espinas sueltas entre la arena.',
      coords: { x: 22, z: 35 },
      icon: '🌿',
    },
  ],
  port: [
    {
      id: 'clue_port_sedal',
      title: 'Restos de sedal con anzuelo',
      desc: 'Un trozo de nailon transparente abandonado junto a las cajas de la lonja. Es un peligro crítico para las aves marinas.',
      coords: { x: 18, z: -20 },
      icon: '🪝',
    },
    {
      id: 'clue_port_plumas',
      title: 'Plumas grises y blancas',
      desc: 'Plumas de vuelo de gaviota patiamarilla en el borde del muelle. El animal parece haber aleteado con dificultad.',
      coords: { x: 22, z: -48 },
      icon: '🪶',
    },
  ],
  marjal: [
    {
      id: 'clue_marjal_fango',
      title: 'Rastro de barro fresco',
      desc: 'Huellas hendidas de pezuñas en el lodo del canal. Un jabalí joven ha bajado a beber huyendo del calor.',
      coords: { x: -12, z: 25 },
      icon: '🐗',
    },
    {
      id: 'clue_marjal_carrizo',
      title: 'Cañas de carrizo partidas',
      desc: 'El carrizal está abierto en sendero estrecho que se adentra hacia el Ullal de l’Estany.',
      coords: { x: 15, z: 32 },
      icon: '🌾',
    },
  ],
  riu: [
    {
      id: 'clue_riu_hierba',
      title: 'Tallos de trébol mordisqueados',
      desc: 'Cortes limpios en la vegetación baja de ribera típicos de los incisivos de un conejo europeo.',
      coords: { x: -28, z: 10 },
      icon: '🌱',
    },
    {
      id: 'clue_riu_madriguera',
      title: 'Boca de conejera entre raíces',
      desc: 'Entrada a una madriguera excavada bajo un álamo blanco. Hay tierra fresca removida.',
      coords: { x: -38, z: -22 },
      icon: '🕳️',
    },
  ],
  casc: [
    {
      id: 'clue_casc_cuenco',
      title: 'Cuenco de agua vacío',
      desc: 'Un bebedero puesto por los vecinos de la colonia felina del centro histórico, completamente seco por el sol.',
      coords: { x: -22, z: -20 },
      icon: '🥣',
    },
    {
      id: 'clue_casc_huellas',
      title: 'Huellas sobre piedra histórica',
      desc: 'Marcas de polvo en las baldosas que llevan hacia los soportales del Palau Ducal.',
      coords: { x: -8, z: -25 },
      icon: '🐾',
    },
  ],
  montduver: [
    {
      id: 'clue_montduver_plumon',
      title: 'Plumón sedoso en un pino',
      desc: 'Pequeñas plumas suaves de búho o mochuelo enganchadas en la corteza de un pino carrasco.',
      coords: { x: -22, z: -30 },
      icon: '🪶',
    },
    {
      id: 'clue_montduver_egagropila',
      title: 'Egagrópila en la roca caliza',
      desc: 'Resto de digestión con pequeños élitros de escarabajos, confirmando la presencia de un mochuelo activo en el sendero.',
      coords: { x: 12, z: -18 },
      icon: '🔍',
    },
  ],
};

export class Clues3D {
  constructor(scene, terrainBuilder) {
    this.scene = scene;
    this.terrain = terrainBuilder;
    this.cluesGroup = new THREE.Group();
    this.scene.add(this.cluesGroup);

    this.activeClues = [];
  }

  /** Genera las pistas de la zona */
  buildForZone(zoneId) {
    this.clear();
    const list = CLUES_DATA[zoneId] ?? [];

    for (const clue of list) {
      const group = new THREE.Group();
      const x = clue.coords.x;
      const z = clue.coords.z;
      const y = this.terrain.getHeight(x, z, zoneId);

      // Marcador 3D de pista: lupa brillante con icono
      const marker = this.createClueMarker();
      group.add(marker);

      group.position.set(x, y + 0.15, z);
      this.cluesGroup.add(group);

      this.activeClues.push({
        group,
        marker,
        data: clue,
      });
    }
  }

  createClueMarker() {
    const group = new THREE.Group();

    // Aro exterior brillante amarillo/dorado
    const ringGeo = new THREE.RingGeometry(0.5, 0.7, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf1c40f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Prisma flotante indicador
    const prismGeo = new THREE.OctahedronGeometry(0.35);
    const prismMat = new THREE.MeshStandardMaterial({
      color: 0xf39c12,
      emissive: 0xf1c40f,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    const prism = new THREE.Mesh(prismGeo, prismMat);
    prism.position.y = 0.85;
    group.add(prism);

    // Luz tenue de pista
    const light = new THREE.PointLight(0xf1c40f, 1, 6);
    light.position.y = 0.9;
    group.add(light);

    return group;
  }

  /** Actualización de animación por fotograma */
  update(time) {
    for (const clue of this.activeClues) {
      if (clue.marker) {
        clue.marker.rotation.y = time * 2;
        const pulse = 1 + Math.sin(time * 4) * 0.15;
        clue.marker.scale.set(pulse, pulse, pulse);
      }
    }
  }

  /** Encuentra la pista más cercana si el jugador está en el radio */
  getNearbyClue(pos, maxDist = 5) {
    for (const clue of this.activeClues) {
      const dist = pos.distanceTo(clue.group.position);
      if (dist <= maxDist) {
        return { ...clue.data, distance: dist };
      }
    }
    return null;
  }

  clear() {
    while (this.cluesGroup.children.length > 0) {
      const obj = this.cluesGroup.children[0];
      this.cluesGroup.remove(obj);
    }
    this.activeClues = [];
  }
}
