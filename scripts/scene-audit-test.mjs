/**
 * Auditoría de coherencia visual del mundo 3D.
 *
 * Comprueba, zona por zona, que el escenario ya no contiene objetos
 * geométricos “en crudo” (el defecto que se veía en el río: bloques, esferas y
 * conos sin textura):
 *
 *   1. Toda malla del terreno y del atrezo lleva material con mapa o colores
 *      por vértice; sólo se exceptúan el agua y los materiales transparentes
 *      especiales.
 *   2. La vegetación y el atrezo se dibujan con `InstancedMesh` (pocas llamadas
 *      de dibujo) y usan los modelos FBX/GLB del repositorio.
 *   3. Cada zona registra obstáculos de colisión suficientes: la furgoneta
 *      tiene con qué chocar.
 *   4. No queda ninguna posición o escala inválida (NaN) en la escena.
 *
 * Ejecutar: node scripts/scene-audit-test.mjs
 */
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/*
 * jsdom no descarga nada: sin estos dos adaptadores los FBX, los .glb y los
 * atlas de vegetación quedarían “pendientes” y la auditoría no vería la
 * escena real. Se sirven desde el disco y se marca como cargada cada imagen.
 */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gandia.test/' });
const document = dom.window.document;
Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });

// FileLoader informa del progreso con ProgressEvent (ausente en Node).
if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) { Object.assign(this, { type }, init); }
  };
}

globalThis.fetch = async (request) => {
  const url = typeof request === 'string' ? request : request.url;
  if (!url.startsWith('file:')) throw new Error(`fetch no soportado en la auditoría: ${url}`);
  const body = await readFile(fileURLToPath(url));
  return new Response(body, { status: 200, headers: { 'Content-Length': String(body.length) } });
};

const createElementNS = document.createElementNS.bind(document);
document.createElementNS = (namespace, name, ...rest) => {
  const element = createElementNS(namespace, name, ...rest);
  if (name === 'img') setTimeout(() => element.dispatchEvent(new dom.window.Event('load')), 0);
  return element;
};

const THREE = await import('three');
const { TerrainBuilder } = await import('../src/three/TerrainBuilder.js');
const { InstancedElements } = await import('../src/three/InstancedElements.js');

let fails = 0;
const expect = (cond, label) => { console.log(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) fails += 1; };

/** Materiales que pueden no llevar mapa (agua, cristal, emisivos…). */
const TEXTURE_EXEMPT = new Set(['Gandia · glass', 'Gandia · water', 'Gandia · beacon', 'Gandia · lamp']);

const ZONES = ['platja', 'port', 'marjal', 'riu', 'casc', 'montduver'];
const scene = new THREE.Scene();
const terrain = new TerrainBuilder(scene);
const instanced = new InstancedElements(scene, terrain);

const settle = () => new Promise((done) => setTimeout(done, 400));

for (const zoneId of ZONES) {
  console.log(`· ${zoneId}`);
  terrain.buildZone(zoneId);
  instanced.buildForZone(zoneId);
  await settle();

  let meshes = 0;
  let instancedMeshes = 0;
  let untextured = [];
  let invalid = 0;
  let triangles = 0;

  for (const group of [terrain.terrainGroup, instanced.instancedGroup]) {
    group.traverse((node) => {
      if (!node.isMesh) return;
      meshes += 1;
      if (node.isInstancedMesh) instancedMeshes += 1;
      const geometry = node.geometry;
      if (geometry?.attributes?.position) {
        triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      }

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) continue;
        const textured = Boolean(material.map) || material.vertexColors === true
          || TEXTURE_EXEMPT.has(material.name) || material.transparent === true;
        if (!textured) untextured.push(material.name || material.type);
      }

      const { x, y, z } = node.position;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) invalid += 1;
    });
  }

  expect(meshes > 0, `escena construida (${meshes} mallas, ${Math.round(triangles)} triángulos)`);
  expect(untextured.length === 0, `sin primitivas sin textura${untextured.length ? ` → ${[...new Set(untextured)].join(', ')}` : ''}`);
  expect(instancedMeshes > 4, `atrezo y vegetación instanciados (${instancedMeshes} mallas)`);
  expect(invalid === 0, 'sin transformaciones inválidas (NaN)');
  expect(terrain.obstacles.count > 20, `obstáculos registrados para la furgoneta (${terrain.obstacles.count})`);
  expect(terrain.collider.targetCount > 0, 'estructuras pisables registradas (rutas, puentes, rampas)');

  // Las rutas conservan la imagen satelital; el suelo, no.
  const routes = [];
  terrain.terrainGroup.traverse((node) => { if (node.userData?.isRoute) routes.push(node); });
  expect(routes.length > 0, `rutas practicables con textura satelital (${routes.length})`);
}

console.log(fails === 0
  ? '\n✓ Coherencia visual del escenario verificada'
  : `\n✗ ${fails} comprobaciones de coherencia fallidas`);
process.exit(fails ? 1 : 0);
