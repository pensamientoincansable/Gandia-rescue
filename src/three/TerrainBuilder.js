import * as THREE from 'three';
import { createSatelliteTerrainTexture, createRoadTexture, createWaterTexture } from './TextureFactory.js';

/**
 * Generador de terrenos 3D procedurales para las 6 localizaciones de Gandía.
 * Proporciona malla de terreno con mapeo satelital, agua animada, carreteras,
 * edificios emblemáticos y función de elevación continua getHeight(x, z).
 */

export class TerrainBuilder {
  constructor(scene) {
    this.scene = scene;
    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);
    this.waterMeshes = [];
    this.animatedObjects = [];
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
      // Marjal: terreno bajo y llano con canales de agua
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

  /** Construye la escena 3D completa de la zona elegida */
  buildZone(zoneId) {
    // Limpiar terreno anterior
    this.clear();

    const terrainSize = 260;
    const segments = 90;
    const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const py = this.getHeight(px, pz, zoneId);
      pos.setY(i, py);
    }
    geometry.computeVertexNormals();

    const satTexture = createSatelliteTerrainTexture(zoneId);
    satTexture.repeat.set(1, 1);

    const terrainMat = new THREE.MeshStandardMaterial({
      map: satTexture,
      roughness: 0.85,
      metalness: 0.08,
      flatShading: zoneId === 'montduver',
    });

    const terrainMesh = new THREE.Mesh(geometry, terrainMat);
    terrainMesh.receiveShadow = true;
    this.terrainGroup.add(terrainMesh);

    // Carreteras y sendas transitables para la furgoneta
    this.buildRoadNetwork(zoneId);

    // Cuerpos de agua (mar, río, ullals, dársena)
    this.buildWaterBodies(zoneId);

    // Elementos arquitectónicos y singulares de cada zona de Gandía
    this.buildZoneLandmarks(zoneId);

    return this.terrainGroup;
  }

  /** Construye la red de carreteras asfaltadas y caminos de tierra */
  buildRoadNetwork(zoneId) {
    const roadMat = new THREE.MeshStandardMaterial({
      map: createRoadTexture(),
      roughness: 0.6,
      metalness: 0.1,
    });

    if (zoneId === 'platja') {
      // Carretera costera / Paseo Marítimo a lo largo del eje Z
      const roadGeo = new THREE.PlaneGeometry(10, 240);
      roadGeo.rotateX(-Math.PI / 2);
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(-15, 0.25, 0);
      road.receiveShadow = true;
      this.terrainGroup.add(road);

      // Pasarela peatonal de madera sobre la arena
      const woodMat = new THREE.MeshStandardMaterial({ color: 0xcaa26b, roughness: 0.9 });
      const boardGeo = new THREE.BoxGeometry(4, 0.2, 180);
      const board = new THREE.Mesh(boardGeo, woodMat);
      board.position.set(10, 0.4, 0);
      this.terrainGroup.add(board);
    } else if (zoneId === 'port') {
      // Vía principal de acceso a la lonja y muelle
      const roadGeo = new THREE.PlaneGeometry(12, 220);
      roadGeo.rotateX(-Math.PI / 2);
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(-10, 0.85, 0);
      this.terrainGroup.add(road);
    } else if (zoneId === 'marjal') {
      // Camino rural entre los arrozales
      const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8a6e4d, roughness: 0.95 });
      const pathGeo = new THREE.PlaneGeometry(8, 230);
      pathGeo.rotateX(-Math.PI / 2);
      const path = new THREE.Mesh(pathGeo, dirtMat);
      path.position.set(-20, 0.15, 0);
      this.terrainGroup.add(path);

      // Puentes de madera sobre los canales
      const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x6e5239, roughness: 0.8 });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 18), bridgeMat);
      bridge.position.set(-20, 0.5, 0);
      this.terrainGroup.add(bridge);
    } else if (zoneId === 'riu') {
      // Carretera de ribera y puente histórico sobre el río Serpis
      const roadGeo = new THREE.PlaneGeometry(9, 220);
      roadGeo.rotateX(-Math.PI / 2);
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(-35, 1.45, 0);
      this.terrainGroup.add(road);

      // Gran puente sobre el río
      const bridgeGroup = new THREE.Group();
      const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 10), roadMat);
      bridgeDeck.position.set(0, 2.5, 0);
      bridgeGroup.add(bridgeDeck);

      // Pilares del puente
      const pilarMat = new THREE.MeshStandardMaterial({ color: 0x888279, roughness: 0.9 });
      for (const px of [-15, 15]) {
        const pilar = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 5, 8), pilarMat);
        pilar.position.set(px, 0, 0);
        bridgeGroup.add(pilar);
      }
      this.terrainGroup.add(bridgeGroup);
    } else if (zoneId === 'casc') {
      // Vías adoquinadas que cruzan la plaza histórica
      const stoneRoadMat = new THREE.MeshStandardMaterial({ color: 0x827d73, roughness: 0.7 });
      const r1 = new THREE.Mesh(new THREE.PlaneGeometry(10, 220), stoneRoadMat);
      r1.rotateX(-Math.PI / 2);
      r1.position.set(0, 0.12, 0);
      this.terrainGroup.add(r1);

      const r2 = new THREE.Mesh(new THREE.PlaneGeometry(220, 10), stoneRoadMat);
      r2.rotateX(-Math.PI / 2);
      r2.position.set(0, 0.13, 0);
      this.terrainGroup.add(r2);
    } else if (zoneId === 'montduver') {
      // Pista forestal serpenteante hacia la cumbre del Montdúver
      const trailMat = new THREE.MeshStandardMaterial({ color: 0xa89f8d, roughness: 0.95 });
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-70, 5, -70),
        new THREE.Vector3(-40, 12, -20),
        new THREE.Vector3(10, 19, -40),
        new THREE.Vector3(35, 25, 10),
        new THREE.Vector3(0, 32, 0),
      ]);
      const tubeGeo = new THREE.TubeGeometry(curve, 40, 3.8, 6, false);
      const trail = new THREE.Mesh(tubeGeo, trailMat);
      trail.position.y = -2.8;
      this.terrainGroup.add(trail);
    }
  }

  /** Construye superficies de agua con shaders y cáusticas */
  buildWaterBodies(zoneId) {
    if (zoneId === 'platja') {
      // Mar Mediterráneo
      const seaGeo = new THREE.PlaneGeometry(160, 260, 40, 40);
      seaGeo.rotateX(-Math.PI / 2);
      const seaMat = new THREE.MeshStandardMaterial({
        map: createWaterTexture(true),
        color: 0x2289a6,
        roughness: 0.2,
        metalness: 0.4,
        transparent: true,
        opacity: 0.88,
      });
      const sea = new THREE.Mesh(seaGeo, seaMat);
      sea.position.set(110, -0.4, 0);
      this.terrainGroup.add(sea);
      this.waterMeshes.push(sea);
    } else if (zoneId === 'port') {
      // Dársena del puerto de Gandía
      const portWaterGeo = new THREE.PlaneGeometry(140, 160);
      portWaterGeo.rotateX(-Math.PI / 2);
      const portWaterMat = new THREE.MeshStandardMaterial({
        map: createWaterTexture(true),
        color: 0x1d5869,
        roughness: 0.25,
        metalness: 0.3,
        transparent: true,
        opacity: 0.92,
      });
      const water = new THREE.Mesh(portWaterGeo, portWaterMat);
      water.position.set(80, -0.6, 0);
      this.terrainGroup.add(water);
      this.waterMeshes.push(water);
    } else if (zoneId === 'marjal') {
      // Lagunas y Ullals de la Marjal
      const ullalGeo = new THREE.PlaneGeometry(30, 45);
      ullalGeo.rotateX(-Math.PI / 2);
      const ullalMat = new THREE.MeshStandardMaterial({
        map: createWaterTexture(false),
        color: 0x256658,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.9,
      });
      const ullal = new THREE.Mesh(ullalGeo, ullalMat);
      ullal.position.set(30, -0.5, 20);
      this.terrainGroup.add(ullal);
      this.waterMeshes.push(ullal);
    } else if (zoneId === 'riu') {
      // Río Serpis
      const riverGeo = new THREE.PlaneGeometry(24, 260);
      riverGeo.rotateX(-Math.PI / 2);
      const riverMat = new THREE.MeshStandardMaterial({
        map: createWaterTexture(false),
        color: 0x31695f,
        roughness: 0.25,
        metalness: 0.3,
        transparent: true,
        opacity: 0.88,
      });
      const river = new THREE.Mesh(riverGeo, riverMat);
      river.position.set(0, -0.9, 0);
      this.terrainGroup.add(river);
      this.waterMeshes.push(river);
    }
  }

  /** Construye hitos arquitectónicos característicos de Gandía */
  buildZoneLandmarks(zoneId) {
    if (zoneId === 'platja') {
      // Torreta de socorrismo y vigilancia marítima
      const tower = this.createLifeguardTower();
      tower.position.set(32, this.getHeight(32, 20, 'platja'), 20);
      this.terrainGroup.add(tower);
    } else if (zoneId === 'port') {
      // Faro verde y rojo del puerto + lonja de pescadores
      const faroVerde = this.createLighthouse(0x27ae60);
      faroVerde.position.set(45, 0.8, -60);
      this.terrainGroup.add(faroVerde);

      const faroRojo = this.createLighthouse(0xc0392b);
      faroRojo.position.set(45, 0.8, 60);
      this.terrainGroup.add(faroRojo);

      // Barco de pesca tradicional amarrado
      const boat = this.createFishingBoat();
      boat.position.set(38, -0.6, -15);
      this.terrainGroup.add(boat);
    } else if (zoneId === 'marjal') {
      // Alquería tradicional valenciana
      const alqueria = this.createAlqueria();
      alqueria.position.set(-50, 0.3, 30);
      this.terrainGroup.add(alqueria);
    } else if (zoneId === 'casc') {
      // Fachada de la Colegiata de Santa María y Palacio Ducal
      const collegiate = this.createHistoricBuilding();
      collegiate.position.set(-45, 0.1, -25);
      this.terrainGroup.add(collegiate);

      // Fuente monumental en el centro de la plaza
      const fountain = this.createHistoricFountain();
      fountain.position.set(0, 0.1, 0);
      this.terrainGroup.add(fountain);
    } else if (zoneId === 'montduver') {
      // Torre de telecomunicaciones y mirador en la cumbre
      const summitTower = this.createSummitMast();
      summitTower.position.set(0, 32, 0);
      this.terrainGroup.add(summitTower);
    }
  }

  /* ------------------------------------------------ Constructores de modelos 3D */

  createLifeguardTower() {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.8 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f1de, roughness: 0.5 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.5 });

    // 4 postes
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.5), woodMat);
      leg.position.set(x, 2.25, z);
      group.add(leg);
    }

    // Cabina
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.8), whiteMat);
    cab.position.set(0, 5.2, 0);
    group.add(cab);

    // Tejado rojo
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), redMat);
    roof.position.set(0, 6.9, 0);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    return group;
  }

  createLighthouse(beaconColor) {
    const group = new THREE.Group();
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.6 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: beaconColor, roughness: 0.6 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 12, 16), towerMat);
    base.position.y = 6;
    group.add(base);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 3, 16), stripeMat);
    stripe.position.y = 7.5;
    group.add(stripe);

    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12), new THREE.MeshStandardMaterial({ color: 0x2c3e50 }));
    lantern.position.y = 13.1;
    group.add(lantern);

    // Foco de luz
    const light = new THREE.PointLight(beaconColor, 3, 25);
    light.position.set(0, 13.5, 0);
    group.add(light);

    return group;
  }

  createFishingBoat() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x1f3c88, roughness: 0.7 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xee6f57, roughness: 0.6 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.5 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2, 11), hullMat);
    hull.position.y = 0.5;
    group.add(hull);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 3.8), whiteMat);
    cabin.position.set(0, 2.4, -1.5);
    group.add(cabin);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6), deckMat);
    mast.position.set(0, 4.5, 2);
    group.add(mast);

    return group;
  }

  createAlqueria() {
    const group = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8dcbe, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb55234, roughness: 0.75 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 10), wallMat);
    body.position.y = 3;
    group.add(body);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(10.5, 3.5, 4), roofMat);
    roof.position.y = 7.6;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    return group;
  }

  createHistoricBuilding() {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb8ad9b, roughness: 0.8 });
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x8a7f6f, roughness: 0.9 });

    const mainFacade = new THREE.Mesh(new THREE.BoxGeometry(32, 16, 12), stoneMat);
    mainFacade.position.y = 8;
    group.add(mainFacade);

    // Campanario gótico
    const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 28, 7), darkStone);
    tower.position.set(13, 14, 0);
    group.add(tower);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.5, 7, 4), new THREE.MeshStandardMaterial({ color: 0x5a5245 }));
    spire.position.set(13, 31.5, 0);
    spire.rotation.y = Math.PI / 4;
    group.add(spire);

    return group;
  }

  createHistoricFountain() {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9e9587, roughness: 0.7 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3ab4c8, roughness: 0.2, metalness: 0.4 });

    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.8, 16), stoneMat);
    basin.position.y = 0.4;
    group.add(basin);

    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.1, 16), waterMat);
    water.position.y = 0.75;
    group.add(water);

    const centralPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 2.6, 12), stoneMat);
    centralPillar.position.y = 1.7;
    group.add(centralPillar);

    return group;
  }

  createSummitMast() {
    const group = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, metalness: 0.8, roughness: 0.3 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.3 });

    // Torre de celosía
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.2, 22, 6), metalMat);
    mast.position.y = 11;
    group.add(mast);

    // Baliza de aviso aéreo
    const beacon = new THREE.PointLight(0xff2222, 2, 30);
    beacon.position.y = 22.5;
    group.add(beacon);

    return group;
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
    while (this.terrainGroup.children.length > 0) {
      const obj = this.terrainGroup.children[0];
      this.terrainGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    }
    this.waterMeshes = [];
    this.animatedObjects = [];
  }
}
