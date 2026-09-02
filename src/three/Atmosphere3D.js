import * as THREE from 'three';
import { createSkyTexture } from './TextureFactory.js';

/**
 * Gestor de atmósfera, iluminación y cielo para la simulación 3D de Gandía.
 * Proporciona cúpula celeste procedural con gradientes mediterráneos,
 * sol direccional con sombras suaves, nubes flotantes y niebla atmosférica.
 */

export class Atmosphere3D {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.ambientLight = null;
    this.hemiLight = null;
    this.sunLight = null;
    this.skyDome = null;
    this.cloudMeshes = [];

    this.setupLighting();
    this.setupSkyDome();
    this.setupClouds();
  }

  setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xdbe7e4, 0.65);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x7ec8e3, 0x8a7e68, 0.55);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    this.sunLight.position.set(60, 90, 50);
    this.sunLight.castShadow = true;
    if (this.sunLight.shadow && this.sunLight.shadow.mapSize) {
      this.sunLight.shadow.mapSize.width = 1024;
      this.sunLight.shadow.mapSize.height = 1024;
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 280;
      this.sunLight.shadow.camera.left = -90;
      this.sunLight.shadow.camera.right = 90;
      this.sunLight.shadow.camera.top = 90;
      this.sunLight.shadow.camera.bottom = -90;
    }
    this.scene.add(this.sunLight);
  }

  setupSkyDome() {
    const skyGeo = new THREE.SphereGeometry(240, 24, 16);
    skyGeo.scale(-1, 1, 1);

    // Textura de nubes real aportada en /media/image. createSkyTexture usa un
    // DataTexture azul en entornos sin DOM, así que el render nunca queda vacío.
    const texture = createSkyTexture('platja');
    this.skyTexture = texture;

    const skyMat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      dithering: true,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(this.skyDome);

    this.scene.fog = new THREE.FogExp2(0xaad8e6, 0.0035);
  }

  setupClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    });

    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();
      const numPuffs = 4 + Math.floor(Math.random() * 4);
      for (let p = 0; p < numPuffs; p++) {
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + Math.random() * 6, 1), cloudMat);
        puff.position.set((p - numPuffs / 2) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5);
        group.add(puff);
      }

      const angle = (i / 12) * Math.PI * 2;
      const dist = 70 + Math.random() * 80;
      group.position.set(Math.cos(angle) * dist, 55 + (i % 3) * 8, Math.sin(angle) * dist);
      this.group.add(group);
      this.cloudMeshes.push(group);
    }
  }

  setZoneAtmosphere(zoneId) {
    if (!this.scene.fog || !this.sunLight) return;

    // Cada paisaje recibe su propio cielo de los assets de media; cambiar el
    // mapa, no reconstruir la cúpula, evita parpadeos durante los viajes.
    const nextSky = createSkyTexture(zoneId);
    if (this.skyDome?.material && this.skyTexture !== nextSky) {
      this.skyTexture = nextSky;
      this.skyDome.material.map = nextSky;
      this.skyDome.material.needsUpdate = true;
    }

    if (zoneId === 'platja') {
      this.scene.fog.color.setHex(0xb5e2fa);
      this.scene.fog.density = 0.003;
      this.sunLight.color.setHex(0xfff5eb);
      this.sunLight.intensity = 1.45;
    } else if (zoneId === 'port') {
      this.scene.fog.color.setHex(0xa9d6e5);
      this.scene.fog.density = 0.0035;
      this.sunLight.color.setHex(0xfffae6);
      this.sunLight.intensity = 1.4;
    } else if (zoneId === 'marjal') {
      this.scene.fog.color.setHex(0xc2e2cf);
      this.scene.fog.density = 0.0045;
      this.sunLight.color.setHex(0xfffae0);
      this.sunLight.intensity = 1.35;
    } else if (zoneId === 'riu') {
      this.scene.fog.color.setHex(0xbce0da);
      this.scene.fog.density = 0.004;
      this.sunLight.intensity = 1.3;
    } else if (zoneId === 'casc') {
      this.scene.fog.color.setHex(0xd6dbdb);
      this.scene.fog.density = 0.0035;
      this.sunLight.color.setHex(0xffeedb);
      this.sunLight.intensity = 1.4;
    } else if (zoneId === 'montduver') {
      this.scene.fog.color.setHex(0x90cae8);
      this.scene.fog.density = 0.0022;
      this.sunLight.color.setHex(0xffffff);
      this.sunLight.intensity = 1.55;
    }
  }

  update(delta, time) {
    for (let i = 0; i < this.cloudMeshes.length; i++) {
      const c = this.cloudMeshes[i];
      c.position.x += Math.sin(time * 0.02 + i) * 0.04;
      c.position.z += Math.cos(time * 0.02 + i) * 0.04;
    }
  }
}
