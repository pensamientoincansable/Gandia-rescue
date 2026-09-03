/**
 * Genera los modelos 3D `.glb` del atrezo y de los hitos del mundo de Gandía
 * con Three.js y el GLTFExporter oficial.
 *
 *   node scripts/gen-props.mjs
 *
 * Escribe (sobrescribiendo) en `public/models/world/`:
 *   - boat-fishing.glb      Barco de pesca tradicional del puerto
 *   - lighthouse.glb        Faro de la bocana (verde / rojo)
 *   - tower-lifeguard.glb   Torreta de socorrismo de la playa
 *   - alqueria.glb          Alquería valenciana de la huerta
 *   - collegiate.glb        Fachada de la Colegiata de Santa María
 *   - fountain.glb          Fuente monumental de la plaza
 *   - mast-summit.glb       Torre de telecomunicaciones de la cumbre
 *   - bridge-arch.glb       Puente en arco sobre el Serpis
 *   - boardwalk.glb         Pasarela de madera sobre la arena
 *   - jetty.glb             Pantalán de amarre del puerto
 *
 * Cada malla usa materiales **nombrados** (`wood`, `stone`, `tile`…). En tiempo
 * de ejecución `PropsLibrary` sustituye esos materiales por otros texturizados
 * con las imágenes de `media/` adaptadas en `public/world/materials`, de modo
 * que la geometría modelada y las fotografías del repositorio se combinan sin
 * dejar ninguna primitiva sin textura en la escena.
 *
 * La geometría se exporta sin indexar y con normales por cara: es la forma de
 * conservar el sombreado plano (faceta dura) característico de la era PS2.
 */
import * as THREE from 'three';
import { GLTFExporter } from '../node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ polyfills */
if (typeof globalThis.Blob === 'undefined') {
  const { Blob: NodeBlob } = await import('node:buffer');
  globalThis.Blob = NodeBlob;
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(async (buf) => {
        const { Buffer } = await import('node:buffer');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
}

/* ------------------------------------------------------------------ utilidades */
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(rootDir, 'public/models/world');

/** Paleta base de los materiales nombrados (se reemplazan en caliente). */
const PALETTE = {
  wood: { color: 0x9c6a3f, roughness: 0.82 },
  timber: { color: 0x7a4a2c, roughness: 0.84 },
  stone: { color: 0xa8a396, roughness: 0.9 },
  rock: { color: 0xa7a294, roughness: 0.95 },
  gravel: { color: 0x9d9a86, roughness: 0.95 },
  cobble: { color: 0x9a9184, roughness: 0.85 },
  plaster: { color: 0xe0d8c4, roughness: 0.9 },
  tile: { color: 0xb06540, roughness: 0.78 },
  metal: { color: 0x5d646c, roughness: 0.45, metalness: 0.55 },
  rust: { color: 0x8d5a35, roughness: 0.8, metalness: 0.2 },
  cloth: { color: 0xd96a3a, roughness: 0.75 },
  canvas: { color: 0x2f7f96, roughness: 0.75 },
  rope: { color: 0xbfae8e, roughness: 0.9 },
  flag: { color: 0xf06f3c, roughness: 0.7 },
  glass: { color: 0x9fd8e6, roughness: 0.15, metalness: 0.4 },
  water: { color: 0x3ab4c8, roughness: 0.2, metalness: 0.35 },
  beacon: { color: 0xffd27a, roughness: 0.3, emissive: 0xffb703, emissiveIntensity: 1.4 },
  lamp: { color: 0xfff2d0, roughness: 0.3, emissive: 0xffe6a8, emissiveIntensity: 1.1 },
};

const materialCache = new Map();
function named(name) {
  if (materialCache.has(name)) return materialCache.get(name);
  const settings = PALETTE[name] ?? PALETTE.stone;
  const material = new THREE.MeshStandardMaterial({
    name,
    color: settings.color,
    roughness: settings.roughness ?? 0.85,
    metalness: settings.metalness ?? 0.05,
    emissive: settings.emissive ?? 0x000000,
    emissiveIntensity: settings.emissiveIntensity ?? 1,
    transparent: name === 'glass',
    opacity: name === 'glass' ? 0.55 : 1,
  });
  materialCache.set(name, material);
  return material;
}

/**
 * Normaliza una geometría para exportarla con sombreado plano y centro/pivote
 * controlados. Devuelve la geometría lista para añadir a una malla.
 */
function facet(geometry, { translate = [0, 0, 0], rotate = null } = {}) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (rotate) flat.rotateX(rotate[0]), flat.rotateY(rotate[1]), flat.rotateZ(rotate[2]);
  flat.translate(...translate);
  flat.computeVertexNormals();
  // Sin UV la fusión por material (y el propio glTF) falla: se rellenan a 0.
  if (!flat.attributes.uv) {
    flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
  }
  flat.computeBoundingBox();
  return flat;
}

/**
 * Fusiona todas las piezas que comparten material en una sola malla.
 *
 * Un pantalán o una celosía pueden tener más de cien piezas; sin fusionarlas
 * serían otras tantas llamadas de dibujo por modelo. Al hornear las matrices
 * locales en la geometría el resultado visual es idéntico.
 */
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);

  const buckets = new Map();
  const nodes = [];
  group.traverse((node) => {
    if (!node.isMesh) return;
    nodes.push(node);
    const name = node.material?.name ?? 'stone';
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name).push(node.geometry.clone().applyMatrix4(node.matrixWorld));
  });

  const merged = new THREE.Group();
  merged.name = group.name;

  for (const [name, geometries] of buckets) {
    let geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!geometry) {
      // Si la fusión no es posible, se conservan las piezas originales.
      for (const node of nodes) {
        if ((node.material?.name ?? 'stone') === name) merged.add(node.clone());
      }
      continue;
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, named(name));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    merged.add(mesh);
  }

  return merged;
}

function mesh(geometry, name, { position = [0, 0, 0], rotation = [0, 0, 0], scale = null } = {}) {
  const node = new THREE.Mesh(facet(geometry), named(name));
  node.position.set(...position);
  node.rotation.set(...rotation);
  if (scale) node.scale.set(...scale);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rTop, rBottom, h, seg = 10, open = false) => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const sphere = (r, w = 10, h = 7, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI) =>
  new THREE.SphereGeometry(r, w, h, phiStart, phiLength, thetaStart, thetaLength);
const torus = (r, tube, seg = 8, rings = 12) => new THREE.TorusGeometry(r, tube, seg, rings);

/** Anillo/polígono extrusionado: útil para cascos, barandillas y basamentos. */
function ring(sides, radius, thickness) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const outer = (x, z, y) => [Math.cos(x) * radius, y, Math.sin(x) * radius];
    // cara exterior
    positions.push(...outer(a0, 0, -thickness / 2), ...outer(a1, 0, -thickness / 2), ...outer(a1, 0, thickness / 2));
    positions.push(...outer(a0, 0, -thickness / 2), ...outer(a1, 0, thickness / 2), ...outer(a0, 0, thickness / 2));
  }
  for (let i = 0; i < positions.length / 3; i += 1) indices.push(i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

/* ------------------------------------------------------------------ modelos */

/** Casco de barco bajo y panzudo, con proa afilada y espejo de popa. */
function boatHull(length, width, height) {
  const geometry = new THREE.BufferGeometry();
  const hl = length / 2;
  const hw = width / 2;
  const sheer = height; // altura de la regala
  const keel = -height * 0.45;

  // Pares (z, semiAncho) que definen la planta: proa puntiaguda → popa ancha.
  const stations = [
    { z: hl, w: 0.04 },
    { z: hl * 0.62, w: hw * 0.55 },
    { z: hl * 0.1, w: hw },
    { z: -hl * 0.5, w: hw * 0.92 },
    { z: -hl, w: hw * 0.7 },
  ];

  const deck = [];
  const bottom = [];
  for (const station of stations) {
    deck.push(station.w, sheer, station.z, -station.w, sheer, station.z);
    bottom.push(station.w * 0.45, keel, station.z, -station.w * 0.45, keel, station.z);
  }

  const vertices = [...deck, ...bottom];
  const indices = [];
  const n = stations.length;
  for (let i = 0; i < n - 1; i += 1) {
    const d0 = i * 2; const d1 = (i + 1) * 2;
    const b0 = n * 2 + i * 2; const b1 = n * 2 + (i + 1) * 2;
    // banda de costado (derecha e izquierda)
    indices.push(d0, b0, b1, d0, b1, d1);
    indices.push(d0 + 1, b1 + 1, b0 + 1, d0 + 1, d1 + 1, b1 + 1);
    // fondo
    indices.push(b0, b0 + 1, b1 + 1, b0, b1 + 1, b1);
  }
  // cubierta (abanico sobre la línea de crujía)
  for (let i = 0; i < n - 1; i += 1) {
    const d0 = i * 2; const d1 = (i + 1) * 2;
    indices.push(d0, d1, d0 + 1, d0 + 1, d1, d1 + 1);
  }
  // espejo de popa
  const last = n - 1;
  indices.push(last * 2, last * 2 + 1, n * 2 + last * 2, n * 2 + last * 2, last * 2 + 1, n * 2 + last * 2 + 1);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function buildFishingBoat() {
  const group = new THREE.Group();
  group.name = 'fishingBoat';

  group.add(mesh(boatHull(9.5, 3.6, 1.35), 'wood', { position: [0, 0.95, 0] }));
  // Regala (cinta de madera que remata el costado)
  group.add(mesh(torus(1.7, 0.11, 5, 14), 'timber', { position: [0, 2.3, 0], rotation: [Math.PI / 2, 0, 0], scale: [1.05, 1.5, 1] }));
  // Cubierta de trabajo
  group.add(mesh(box(2.9, 0.16, 6.4), 'timber', { position: [0, 2.28, -0.6] }));

  // Caseta de mando
  group.add(mesh(box(2.1, 1.5, 2.2), 'plaster', { position: [0, 3.1, -1.9] }));
  group.add(mesh(box(2.2, 0.18, 2.3), 'tile', { position: [0, 3.9, -1.9] }));
  group.add(mesh(box(1.5, 0.5, 0.1), 'glass', { position: [0, 3.35, -0.78] }));
  group.add(mesh(box(0.1, 0.5, 1.3), 'glass', { position: [1.07, 3.35, -1.9] }));
  group.add(mesh(box(0.1, 0.5, 1.3), 'glass', { position: [-1.07, 3.35, -1.9] }));

  // Mástil, botavara y luz de tope
  group.add(mesh(cyl(0.07, 0.1, 5.4, 6), 'metal', { position: [0, 5.0, -0.4] }));
  group.add(mesh(cyl(0.05, 0.05, 3.2, 5), 'metal', { position: [0, 6.1, 1.0], rotation: [Math.PI / 2.4, 0, 0] }));
  group.add(mesh(sphere(0.16), 'beacon', { position: [0, 7.8, -0.4] }));

  // Bote salvavidas y cajas de pesca
  group.add(mesh(box(1.5, 0.5, 0.9), 'cloth', { position: [0, 2.75, 1.9] }));
  for (let i = 0; i < 3; i += 1) {
    group.add(mesh(box(0.8, 0.4, 0.6), 'canvas', { position: [-0.7 + i * 0.7, 2.55, -0.2 + i * 0.5], rotation: [0, i * 0.4, 0] }));
  }
  // Red enrollada en la popa
  group.add(mesh(torus(0.75, 0.22, 5, 10), 'rope', { position: [0, 2.6, 3.2], rotation: [Math.PI / 2, 0, 0] }));
  // Defensas
  for (const z of [-1.6, 0.4, 2.2]) {
    group.add(mesh(cyl(0.14, 0.14, 0.7, 6), 'rope', { position: [1.75, 2.1, z] }));
    group.add(mesh(cyl(0.14, 0.14, 0.7, 6), 'rope', { position: [-1.75, 2.1, z] }));
  }
  return group;
}

function buildLighthouse() {
  const group = new THREE.Group();
  group.name = 'lighthouse';

  // Basamento rocoso
  group.add(mesh(cyl(3.4, 4.2, 1.4, 8), 'rock', { position: [0, 0.7, 0] }));
  // Torre troncocónica con dos franjas de servicio
  group.add(mesh(cyl(1.5, 2.6, 12.5, 12), 'plaster', { position: [0, 7.6, 0] }));
  group.add(mesh(cyl(1.6, 1.72, 1.6, 12), 'rust', { position: [0, 5.2, 0] }));
  group.add(mesh(cyl(1.4, 1.5, 1.1, 12), 'rust', { position: [0, 10.6, 0] }));
  // Galería y barandilla
  group.add(mesh(cyl(2.3, 2.1, 0.35, 12), 'stone', { position: [0, 14.1, 0] }));
  group.add(mesh(ring(12, 2.25, 0.12), 'metal', { position: [0, 14.6, 0] }));
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    group.add(mesh(cyl(0.05, 0.05, 0.9, 5), 'metal', { position: [Math.cos(a) * 2.2, 14.9, Math.sin(a) * 2.2] }));
  }
  // Linterna y tejadillo
  group.add(mesh(cyl(1.15, 1.15, 2.1, 10, true), 'glass', { position: [0, 15.7, 0] }));
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    group.add(mesh(box(0.12, 2.1, 0.12), 'metal', { position: [Math.cos(a) * 1.15, 15.7, Math.sin(a) * 1.15], rotation: [0, -a, 0] }));
  }
  group.add(mesh(cone(1.5, 1.4, 10), 'metal', { position: [0, 17.3, 0] }));
  group.add(mesh(sphere(0.13), 'beacon', { position: [0, 18.1, 0] }));
  group.add(mesh(sphere(0.55, 8, 6), 'beacon', { position: [0, 15.7, 0] }));
  return group;
}

function buildLifeguardTower() {
  const group = new THREE.Group();
  group.name = 'lifeguardTower';

  // Cabina elevada sobre cuatro pies derechos cruzados
  for (const [x, z] of [[-1.5, -1.4], [1.5, -1.4], [-1.5, 1.4], [1.5, 1.4]]) {
    group.add(mesh(cyl(0.11, 0.13, 4.6, 6), 'wood', { position: [x, 2.3, z] }));
  }
  for (const side of [-1, 1]) {
    group.add(mesh(box(0.12, 2.6, 0.12), 'wood', { position: [side * 1.5, 2.2, 0], rotation: [0.55, 0, 0] }));
  }
  // Plataforma, barandilla y escalera
  group.add(mesh(box(3.9, 0.22, 3.7), 'timber', { position: [0, 4.6, 0] }));
  group.add(mesh(ring(4, 0.05, 0.06), 'metal', { position: [0, 5.0, 0], scale: [7, 1, 7] }));
  for (let i = 0; i < 6; i += 1) {
    group.add(mesh(box(0.8, 0.08, 0.3), 'timber', { position: [-1.2, 0.55 + i * 0.72, 2.6 - i * 0.42] }));
  }
  // Caseta, ventanas y cubierta a dos aguas
  group.add(mesh(box(3.2, 2.3, 2.9), 'plaster', { position: [0, 5.9, -0.15] }));
  group.add(mesh(box(2.6, 1.0, 0.12), 'glass', { position: [0, 6.2, 1.32] }));
  group.add(mesh(box(0.12, 1.0, 1.8), 'glass', { position: [1.62, 6.2, -0.15] }));
  group.add(mesh(box(0.12, 1.0, 1.8), 'glass', { position: [-1.62, 6.2, -0.15] }));
  const roofGeometry = new THREE.CylinderGeometry(0.001, 2.5, 1.25, 4, 1);
  group.add(mesh(roofGeometry, 'tile', { position: [0, 7.7, -0.15], rotation: [0, Math.PI / 4, 0], scale: [1.25, 1, 1.05] }));
  // Mástil con bandera de socorrismo
  group.add(mesh(cyl(0.05, 0.06, 2.6, 5), 'metal', { position: [1.5, 8.4, -1.2] }));
  group.add(mesh(box(0.08, 0.9, 1.4), 'flag', { position: [1.5, 9.2, -0.55] }));
  return group;
}

function buildAlqueria() {
  const group = new THREE.Group();
  group.name = 'alqueria';

  // Cuerpo principal con zócalo de mampostería
  group.add(mesh(box(15, 0.9, 10.5), 'stone', { position: [0, 0.45, 0] }));
  group.add(mesh(box(14.4, 5.4, 9.9), 'plaster', { position: [0, 3.4, 0] }));
  // Cubierta a dos aguas de teja árabe
  const roof = new THREE.CylinderGeometry(0.001, 7.8, 3.4, 4, 1);
  group.add(mesh(roof, 'tile', { position: [0, 7.8, 0], rotation: [0, Math.PI / 4, 0], scale: [1.32, 1, 0.96] }));
  // Vanos con dintel y reja
  group.add(mesh(box(2.4, 3.2, 0.25), 'timber', { position: [0, 2.6, 5.05] }));
  group.add(mesh(box(2.0, 2.8, 0.15), 'glass', { position: [0, 2.6, 5.15] }));
  for (const x of [-4.6, 4.6]) {
    group.add(mesh(box(1.7, 1.7, 0.25), 'timber', { position: [x, 3.6, 5.05] }));
    group.add(mesh(box(1.4, 1.4, 0.15), 'glass', { position: [x, 3.6, 5.15] }));
  }
  // Anexo agrícola con arcada
  group.add(mesh(box(7.4, 3.6, 6.4), 'plaster', { position: [10.4, 1.8, 1.2] }));
  group.add(mesh(cyl(0.001, 5.4, 1.8, 4, 1), 'tile', { position: [10.4, 4.5, 1.2], rotation: [0, Math.PI / 4, 0], scale: [1.12, 1, 0.9] }));
  for (let i = 0; i < 3; i += 1) {
    group.add(mesh(torus(0.85, 0.16, 5, 10, Math.PI), 'tile', { position: [8.3 + i * 2.1, 2.0, 4.35], scale: [1, 1, 1] }));
  }
  // Chimenea y pozo
  group.add(mesh(box(1.1, 2.4, 1.1), 'stone', { position: [-4.2, 8.4, -1.6] }));
  group.add(mesh(cyl(0.9, 1.0, 1.1, 8), 'stone', { position: [-9.5, 0.55, 4.2] }));
  group.add(mesh(cyl(0.75, 0.75, 0.12, 8), 'water', { position: [-9.5, 1.0, 4.2] }));
  return group;
}

function buildCollegiate() {
  const group = new THREE.Group();
  group.name = 'collegiate';

  // Nave y contrafuertes
  group.add(mesh(box(26, 15, 13), 'stone', { position: [0, 7.5, 0] }));
  for (const x of [-11, -5.5, 5.5, 11]) {
    group.add(mesh(box(1.6, 12, 2.2), 'stone', { position: [x, 6, 7.2] }));
  }
  // Portada gótica con arquivoltas
  group.add(mesh(box(5.4, 8.5, 1.2), 'stone', { position: [0, 4.25, 6.9] }));
  for (let i = 0; i < 4; i += 1) {
    group.add(mesh(torus(2.2 - i * 0.32, 0.22, 5, 12, Math.PI), 'stone', { position: [0, 5.0, 7.5 - i * 0.12] }));
  }
  group.add(mesh(box(3.0, 5.2, 0.4), 'timber', { position: [0, 2.6, 7.4] }));
  // Rosetón
  group.add(mesh(torus(2.5, 0.35, 6, 16), 'stone', { position: [0, 11.4, 6.7] }));
  group.add(mesh(cyl(2.3, 2.3, 0.3, 16), 'glass', { position: [0, 11.4, 6.7], rotation: [Math.PI / 2, 0, 0] }));
  // Torre campanario con cuerpo de campanas
  group.add(mesh(box(7, 26, 7), 'stone', { position: [14.5, 13, 2.5] }));
  group.add(mesh(box(7.6, 0.8, 7.6), 'stone', { position: [14.5, 26.4, 2.5] }));
  for (const [x, z] of [[12.6, 0.6], [16.4, 0.6], [14.5, 4.4]]) {
    group.add(mesh(box(0.4, 3.4, 0.4), 'stone', { position: [x, 28.2, z] }));
  }
  group.add(mesh(cone(5.4, 5.5, 4), 'tile', { position: [14.5, 32.6, 2.5], rotation: [0, Math.PI / 4, 0] }));
  group.add(mesh(cyl(0.35, 0.35, 1.4, 6), 'timber', { position: [14.5, 28.4, 2.5] }));
  group.add(mesh(sphere(0.4), 'rust', { position: [14.5, 27.6, 2.5] }));
  // Cubierta de la nave
  const roof = new THREE.CylinderGeometry(0.001, 9.6, 4.6, 4, 1);
  group.add(mesh(roof, 'tile', { position: [0, 17.2, 0], rotation: [0, Math.PI / 4, 0], scale: [1.42, 1, 0.72] }));
  return group;
}

function buildFountain() {
  const group = new THREE.Group();
  group.name = 'fountain';

  // Pilas octogonales escalonadas
  group.add(mesh(cyl(5.6, 6.0, 0.9, 8), 'stone', { position: [0, 0.45, 0] }));
  group.add(mesh(cyl(5.2, 5.2, 0.18, 8), 'water', { position: [0, 0.92, 0] }));
  group.add(mesh(ring(8, 5.7, 0.35), 'stone', { position: [0, 1.1, 0] }));
  // Vaso intermedio
  group.add(mesh(cyl(1.2, 1.7, 2.2, 8), 'stone', { position: [0, 2.1, 0] }));
  group.add(mesh(cyl(3.2, 2.6, 0.55, 8), 'stone', { position: [0, 3.4, 0] }));
  group.add(mesh(cyl(2.9, 2.9, 0.14, 8), 'water', { position: [0, 3.62, 0] }));
  // Tazón superior y surtidor
  group.add(mesh(cyl(0.55, 0.9, 1.5, 8), 'stone', { position: [0, 4.4, 0] }));
  group.add(mesh(cyl(1.6, 1.2, 0.4, 8), 'stone', { position: [0, 5.3, 0] }));
  group.add(mesh(cyl(0.16, 0.24, 1.2, 6), 'water', { position: [0, 6.0, 0] }));
  group.add(mesh(sphere(0.32, 8, 6), 'water', { position: [0, 6.7, 0] }));
  // Caños laterales
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    group.add(mesh(cyl(0.1, 0.1, 1.1, 6), 'metal', {
      position: [Math.cos(a) * 1.15, 3.0, Math.sin(a) * 1.15],
      rotation: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7],
    }));
  }
  return group;
}

function buildSummitMast() {
  const group = new THREE.Group();
  group.name = 'summitMast';

  // Celosía de cuatro montantes con diagonales
  const legs = [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]];
  const height = 20;
  const segments = 8;
  for (let s = 0; s < segments; s += 1) {
    const y0 = (s / segments) * height;
    const y1 = ((s + 1) / segments) * height;
    const shrink0 = 1 - (s / segments) * 0.45;
    const shrink1 = 1 - ((s + 1) / segments) * 0.45;

    for (let i = 0; i < 4; i += 1) {
      const [x0, z0] = legs[i].map((v) => v * shrink0);
      const [x1, z1] = legs[i].map((v) => v * shrink1);
      group.add(mesh(box(0.16, Math.hypot(y1 - y0, x1 - x0, z1 - z0), 0.16), 'metal', {
        position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
        rotation: [Math.atan2(z1 - z0, y1 - y0), 0, -Math.atan2(x1 - x0, y1 - y0)],
      }));

      // Diagonal y travesaño del paño
      const [nx0, nz0] = legs[(i + 1) % 4].map((v) => v * shrink0);
      group.add(mesh(box(0.1, Math.hypot(x0 - nx0, z0 - nz0), 0.1), 'metal', {
        position: [(x0 + nx0) / 2, y0, (z0 + nz0) / 2],
        rotation: [0, -Math.atan2(z0 - nz0, x0 - nx0), 0],
      }));
      const [px1, pz1] = legs[(i + 1) % 4].map((v) => v * shrink1);
      group.add(mesh(box(0.1, Math.hypot(x1 - px1, y1 - y0, pz1 - z1) + 0.6, 0.1), 'metal', {
        position: [(x0 + px1) / 2, (y0 + y1) / 2, (z0 + pz1) / 2],
        rotation: [Math.atan2(z0 - pz1, y1 - y0), 0, -Math.atan2(x1 - x0, y1 - y0)],
      }));
    }
  }

  // Plataformas y antenas parabólicas
  for (const y of [9, 15]) {
    group.add(mesh(box(3.6, 0.2, 3.6), 'metal', { position: [0, y, 0] }));
    group.add(mesh(ring(4, 2.4, 0.12), 'metal', { position: [0, y + 0.9, 0] }));
  }
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    group.add(mesh(sphere(1.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'plaster', {
      position: [Math.cos(a) * 1.7, 10.4, Math.sin(a) * 1.7],
      rotation: [Math.PI * 0.15, a, 0],
    }));
    group.add(mesh(cyl(0.06, 0.06, 1.0, 5), 'metal', { position: [Math.cos(a) * 1.7, 9.6, Math.sin(a) * 1.7] }));
  }
  // Baliza de aviso aéreo
  group.add(mesh(cyl(0.12, 0.2, 2.4, 6), 'metal', { position: [0, 21.2, 0] }));
  group.add(mesh(sphere(0.42, 8, 6), 'beacon', { position: [0, 22.6, 0] }));
  return group;
}

function buildBridgeArch() {
  const group = new THREE.Group();
  group.name = 'bridgeArch';

  // Tablero con ligera rasante y pretiles de sillería
  group.add(mesh(box(46, 1.1, 9), 'stone', { position: [0, 6.4, 0] }));
  group.add(mesh(box(46, 0.35, 9), 'cobble', { position: [0, 7.1, 0] }));
  for (const z of [-4.6, 4.6]) {
    group.add(mesh(box(46, 1.5, 0.7), 'stone', { position: [0, 7.9, z] }));
    for (let i = 0; i < 16; i += 1) {
      group.add(mesh(box(1.2, 0.5, 0.85), 'stone', { position: [-22 + i * 2.9, 8.8, z] }));
    }
  }
  // Tajamares y bóvedas de medio punto
  const spans = [-15, 0, 15];
  for (const x of spans) {
    for (const z of [-4.2, 4.2]) {
      group.add(mesh(box(3.4, 6.2, 2.2), 'stone', { position: [x, 3.1, z] }));
      group.add(mesh(cone(1.7, 2.6, 4), 'stone', { position: [x, 7.2, z], rotation: [0, Math.PI / 4, 0] }));
    }
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 8) * Math.PI;
      group.add(mesh(box(0.9, 0.9, 8.4), 'stone', {
        position: [x + Math.cos(a) * 5.4, 5.9 + Math.sin(a) * 5.4, 0],
        rotation: [0, 0, a],
      }));
    }
  }
  // Estribos
  for (const x of [-23.5, 23.5]) {
    group.add(mesh(box(3.5, 6.4, 11), 'stone', { position: [x, 3.2, 0] }));
  }
  return group;
}

function buildBoardwalk() {
  const group = new THREE.Group();
  group.name = 'boardwalk';
  // Largueros y tablas transversales
  for (const z of [-1.6, 1.6]) {
    group.add(mesh(box(24, 0.3, 0.35), 'timber', { position: [0, 0.2, z] }));
  }
  for (let i = 0; i < 40; i += 1) {
    group.add(mesh(box(3.4, 0.14, 0.42), 'wood', { position: [-11.5 + i * 0.59, 0.42, 0] }));
  }
  // Pasamanos
  for (const z of [-1.7, 1.7]) {
    for (let i = 0; i < 7; i += 1) {
      group.add(mesh(cyl(0.06, 0.06, 1.0, 5), 'timber', { position: [-10.5 + i * 3.5, 0.95, z] }));
    }
    group.add(mesh(cyl(0.07, 0.07, 23.5, 5), 'wood', { position: [0, 1.45, z], rotation: [0, 0, Math.PI / 2] }));
  }
  return group;
}

function buildJetty() {
  const group = new THREE.Group();
  group.name = 'jetty';
  // Tablero sobre pilotes
  group.add(mesh(box(26, 0.4, 6), 'timber', { position: [0, 1.3, 0] }));
  group.add(mesh(box(26, 0.12, 6), 'wood', { position: [0, 1.55, 0] }));
  for (let i = 0; i < 7; i += 1) {
    for (const z of [-2.4, 2.4]) {
      group.add(mesh(cyl(0.32, 0.36, 3.4, 6), 'wood', { position: [-12 + i * 4, -0.4, z] }));
      group.add(mesh(box(0.9, 0.16, 0.16), 'timber', { position: [-12 + i * 4, 0.4, z * 0.62], rotation: [0, 0.6, 0] }));
    }
  }
  // Norayes y defensas de amarre
  for (let i = 0; i < 5; i += 1) {
    group.add(mesh(cyl(0.28, 0.34, 0.9, 6), 'metal', { position: [-10 + i * 5, 1.9, 2.5] }));
    group.add(mesh(torus(0.34, 0.09, 5, 10), 'rope', { position: [-10 + i * 5, 2.3, 2.5], rotation: [Math.PI / 2, 0, 0] }));
  }
  // Farolas del pantalán
  for (let i = 0; i < 3; i += 1) {
    group.add(mesh(cyl(0.09, 0.12, 3.4, 6), 'metal', { position: [-9 + i * 9, 3.3, -2.4] }));
    group.add(mesh(sphere(0.3, 8, 6), 'lamp', { position: [-9 + i * 9, 5.1, -2.4] }));
  }
  return group;
}

/* ------------------------------------------------------------------ exportación */

const models = {
  'boat-fishing.glb': buildFishingBoat,
  'lighthouse.glb': buildLighthouse,
  'tower-lifeguard.glb': buildLifeguardTower,
  'alqueria.glb': buildAlqueria,
  'collegiate.glb': buildCollegiate,
  'fountain.glb': buildFountain,
  'mast-summit.glb': buildSummitMast,
  'bridge-arch.glb': buildBridgeArch,
  'boardwalk.glb': buildBoardwalk,
  'jetty.glb': buildJetty,
};

const exporter = new GLTFExporter();

function exportGlb(object) {
  return new Promise((ok, fail) => {
    exporter.parse(object, (result) => ok(result), (error) => fail(error), { binary: true });
  });
}

mkdirSync(outDir, { recursive: true });

let totalBytes = 0;
for (const [file, builder] of Object.entries(models)) {
  const root = mergeByMaterial(builder());
  root.name = file.replace('.glb', '');

  let triangles = 0;
  let pieces = 0;
  root.traverse((node) => {
    if (node.isMesh) {
      pieces += 1;
      triangles += node.geometry.attributes.position.count / 3;
    }
  });

  const glb = await exportGlb(root);
  const buffer = Buffer.from(glb);
  writeFileSync(resolve(outDir, file), buffer);
  totalBytes += buffer.length;
  console.log(`✓ ${file.padEnd(22)} ${String(Math.round(triangles)).padStart(5)} triángulos · ${String(pieces).padStart(2)} malla(s) · ${(buffer.length / 1024).toFixed(1)} kB`);
}

console.log(`\n✓ ${Object.keys(models).length} modelos de atrezo en public/models/world (${(totalBytes / 1024).toFixed(1)} kB)`);
