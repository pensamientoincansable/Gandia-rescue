/**
 * Genera los modelos 3D `.glb` de humanos y animales del juego con Three.js,
 * usando el GLTFExporter oficial. Los modelos son estilizados (low-poly) con
 * una jerarquía de pivotes por extremidad y AnimationClips reales
 * (reposo, caminar, correr y saltar) que gestiona el AnimationMixer del juego.
 *
 * Uso:
 *   node scripts/gen-models.mjs
 *
 * Genera (sobrescribiendo) los ficheros en `public/models/`:
 *   - ranger.glb   (humanoide del guardián)      → Idle, Walk, Run, Jump
 *   - npc.glb      (humanoide de los lugareños)  → Idle, Walk, Talk
 *   - animals/*.glb (8 especies de fauna)        → Idle (+ Walk/Fly gaviota)
 *
 * Por qué se generan proceduralmente: el sandbox no tiene acceso de red a
 * fuentes externas de modelos (threejs.org, GitHub…), así que se construyen y
 * exportan aquí para que el juego cargue `.glb` reales por GLTFLoader.
 */
import * as THREE from 'three';
import { GLTFExporter } from '../node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ polyfills */
// El GLTFExporter usa Blob y FileReader (API de navegador). En Node los
// resolvemos de forma sencilla para poder exportar a .glb binario.
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
const outDir = resolve(rootDir, 'public/models');

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
const sph = (r, material) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material);
const cyl = (rT, rB, h, material) => new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, 8), material);

/**
 * Añade una extremidad a un pivote situado en la articulación. El pivote se
 * anima (rotación) y la malla cuelga por debajo, por lo que al girarlo la
 * extremidad "se mueve" desde la articulación sin necesidad de skinning.
 */
function limb(parent, name, pivotPos, mesh, meshOffsetY) {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.set(...pivotPos);
  mesh.position.y = meshOffsetY;
  mesh.castShadow = true;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

/** Devuelve un VectorKeyframeTrack (posición) muestreando f(t) en [0, dur]. */
function posTrack(name, samples, dur) {
  const times = [];
  const values = [];
  for (const s of samples) {
    const [t, x, y, z] = s;
    times.push(t);
    values.push(x, y, z);
  }
  return new THREE.VectorKeyframeTrack(`${name}.position`, times, values);
}

/** Devuelve un QuaternionKeyframeTrack (rotación) muestreando rx(t), ry(t), rz(t). */
function rotTrack(name, samples, dur) {
  const times = [];
  const values = [];
  for (const [t, rx, ry, rz] of samples) {
    times.push(t);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
}

/** Escala (respiración): samples [t, sx, sy, sz]. */
function scaleTrack(name, samples) {
  const times = [];
  const values = [];
  for (const [t, x, y, z] of samples) {
    times.push(t);
    values.push(x, y, z);
  }
  return new THREE.VectorKeyframeTrack(`${name}.scale`, times, values);
}

/** Muestra una oscilación senoidal en [0, dur] para un track de rotación. */
function sinRotTrack(name, axis, amp, period, dur, phase = 0, samples = 16) {
  const out = [];
  const step = dur / samples;
  for (let i = 0; i <= samples; i += 1) {
    const t = Math.min(dur, i * step);
    const v = amp * Math.sin((2 * Math.PI * t) / period + phase);
    const [rx, ry, rz] = axis === 'x' ? [v, 0, 0] : axis === 'y' ? [0, v, 0] : [0, 0, v];
    out.push([t, rx, ry, rz]);
  }
  return rotTrack(name, out, dur);
}

/* ------------------------------------------------------------------ humanoide */
function buildHumanoid({ skin, top, bottom, hat }) {
  const root = new THREE.Group();
  const parts = {};
  const skinM = mat(skin);
  const topM = mat(top);
  const bottomM = mat(bottom);

  // Torso
  const torso = box(0.5, 0.6, 0.3, topM);
  torso.position.y = 1.08;
  torso.castShadow = true;
  root.add(torso);

  // Pelvis / caderas
  const pelvis = box(0.4, 0.22, 0.24, bottomM);
  pelvis.position.y = 0.8;
  pelvis.castShadow = true;
  root.add(pelvis);

  // Cabeza (pivote para nod/gesto)
  const headPivot = new THREE.Group();
  headPivot.name = 'Head';
  headPivot.position.y = 1.55;
  const head = sph(0.16, skinM);
  head.position.y = 0.08;
  head.castShadow = true;
  headPivot.add(head);
  if (hat) {
    const cap = cyl(0.17, 0.18, 0.1, mat(hat));
    cap.position.y = 0.18;
    headPivot.add(cap);
  }
  root.add(headPivot);
  parts.head = headPivot;

  // Brazos (un segmento, pivote en el hombro)
  parts.armL = limb(root, 'ArmL', [-0.36, 1.3, 0], box(0.15, 0.5, 0.15, topM), -0.26);
  parts.armR = limb(root, 'ArmR', [0.36, 1.3, 0], box(0.15, 0.5, 0.15, topM), -0.26);

  // Piernas (un segmento, pivote en la cadera)
  parts.legL = limb(root, 'LegL', [-0.11, 0.82, 0], box(0.17, 0.48, 0.2, bottomM), -0.24);
  parts.legR = limb(root, 'LegR', [0.11, 0.82, 0], box(0.17, 0.48, 0.2, bottomM), -0.24);

  // Zapatos
  const shoeM = mat(0x2b2b2b);
  for (const sx of [-0.11, 0.11]) {
    const shoe = box(0.19, 0.08, 0.3, shoeM);
    shoe.position.set(sx, 0.03, 0.04);
    shoe.castShadow = true;
    root.add(shoe);
  }

  // Cuerpo como grupo animable (respiración sutil)
  const body = new THREE.Group();
  body.name = 'Body';
  body.add(...root.children.slice());
  root.clear();
  root.add(body);
  parts.body = body;

  return { root, parts };
}

/** Convierte una extremidad al estado de reposo (colgando). */
function idleHumanPose(parts) {
  // Respiración + balanceo muy leve de brazos
  const bodyBreath = scaleTrack('Body', [[0, 1, 1, 1], [1, 1.012, 1, 1], [2, 1, 1, 1]]);
  const armSwayL = sinRotTrack('ArmL', 'x', 0.04, 1.6, 2.0, 0);
  const armSwayR = sinRotTrack('ArmR', 'x', 0.04, 1.6, 2.0, Math.PI);
  const headNod = sinRotTrack('Head', 'y', 0.03, 2.0, 2.0, 0);
  return new THREE.AnimationClip('Idle', 2.0, [bodyBreath, armSwayL, armSwayR, headNod]);
}

function walkHumanClip(parts, period, amp, dur) {
  const legL = sinRotTrack('LegL', 'x', amp, period, dur, 0);
  const legR = sinRotTrack('LegR', 'x', amp, period, dur, Math.PI);
  const armL = sinRotTrack('ArmL', 'x', -amp * 0.6, period, dur, Math.PI);
  const armR = sinRotTrack('ArmR', 'x', -amp * 0.6, period, dur, 0);
  const bob = posTrack('Body', [[0, 0, 0, 0], [dur / 4, 0, 0.02, 0], [dur / 2, 0, 0, 0], [(3 * dur) / 4, 0, 0.02, 0], [dur, 0, 0, 0]]);
  return new THREE.AnimationClip(amp > 0.6 ? 'Run' : 'Walk', dur, [legL, legR, armL, armR, bob]);
}

function jumpHumanClip(parts) {
  // Pose de salto mantenida (el mixer la reproduce con LoopOnce).
  const legL = rotTrack('LegL', [[0, -0.5, 0, 0], [0.1, -0.5, 0, 0]]);
  const legR = rotTrack('LegR', [[0, -0.5, 0, 0], [0.1, -0.5, 0, 0]]);
  const armL = rotTrack('ArmL', [[0, -1.2, 0, 0], [0.1, -1.2, 0, 0]]);
  const armR = rotTrack('ArmR', [[0, -1.2, 0, 0], [0.1, -1.2, 0, 0]]);
  return new THREE.AnimationClip('Jump', 0.3, [legL, legR, armL, armR]);
}

function talkHumanClip(parts) {
  const headTalk = sinRotTrack('Head', 'y', 0.25, 0.9, 2.0, 0);
  const armTalk = sinRotTrack('ArmR', 'x', -0.4, 1.1, 2.0, 0);
  const bodyTalk = sinRotTrack('Body', 'x', 0.05, 1.1, 2.0, 0);
  return new THREE.AnimationClip('Talk', 2.0, [headTalk, armTalk, bodyTalk]);
}

/* ------------------------------------------------------------------ animales */
function buildQuadruped({ color, accent, earMat, tail, scale = 1 }) {
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  bodyG.name = 'Body';

  const body = sph(0.5, mat(color));
  body.scale.set(1.15, 0.85, 1.5);
  body.position.y = 0.55;
  body.castShadow = true;
  bodyG.add(body);

  const head = sph(0.28, mat(color));
  head.position.set(0, 0.55, 0.7);
  head.castShadow = true;
  bodyG.add(head);

  // Orejas
  for (const ex of [-0.1, 0.1]) {
    const earPivot = new THREE.Group();
    earPivot.name = 'Ear';
    earPivot.position.set(ex, 0.8, 0.68);
    const ear = cyl(0.03, 0.05, 0.22, mat(accent));
    ear.position.y = 0.11;
    earPivot.add(ear);
    bodyG.add(earPivot);
  }

  // Patas (pivote en el cuerpo)
  const legMat = mat(accent);
  for (const [lx, lz] of [[-0.32, 0.42], [0.32, 0.42], [-0.32, -0.42], [0.32, -0.42]]) {
    limb(bodyG, 'Leg', [lx, 0.3, lz], box(0.16, 0.32, 0.16, legMat), -0.16);
  }

  if (tail) {
    const tailPivot = new THREE.Group();
    tailPivot.name = 'Tail';
    tailPivot.position.set(0, 0.55, -0.75);
    const t = cyl(0.02, 0.05, 0.25, mat(accent));
    t.position.y = 0.12;
    tailPivot.add(t);
    bodyG.add(tailPivot);
  }

  root.add(bodyG);
  return { root, bodyG };
}

function quadrupedIdle(accent, { ears = true } = {}) {
  const breath = scaleTrack('Body', [[0, 1, 1, 1], [1.2, 1.02, 1.01, 1], [2.4, 1, 1, 1]]);
  const tracks = [breath];
  if (ears) tracks.push(sinRotTrack('Ear', 'x', 0.15, 0.8, 2.4, 0));
  if (accent === 'tail') tracks.push(sinRotTrack('Tail', 'z', 0.5, 0.5, 2.4, 0));
  return new THREE.AnimationClip('Idle', 2.4, tracks);
}

function buildBird({ color, wingMat, beakMat, longNeck = false }) {
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  bodyG.name = 'Body';

  const body = sph(0.4, mat(color));
  body.scale.set(0.9, 0.85, 1.3);
  body.position.y = 0.7;
  body.castShadow = true;
  bodyG.add(body);

  // Cuello y cabeza
  const neckH = longNeck ? 0.8 : 0.35;
  const neck = cyl(0.06, 0.09, neckH, mat(color));
  neck.position.set(0, 0.75 + neckH / 2, 0.5);
  neck.rotation.x = longNeck ? 0.3 : 0.1;
  bodyG.add(neck);
  const head = sph(0.14, mat(color));
  head.position.set(0, longNeck ? 1.45 : 1.15, 0.62);
  bodyG.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, longNeck ? 0.45 : 0.22, 6), mat(beakMat));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, longNeck ? 1.42 : 1.12, 0.78);
  bodyG.add(beak);

  // Alas (pivote para aleteo)
  for (const sx of [-1, 1]) {
    const wingPivot = new THREE.Group();
    wingPivot.name = 'Wing';
    wingPivot.position.set(sx * 0.42, 0.78, 0);
    const wing = box(0.14, 0.06, 0.7, mat(wingMat));
    wing.position.z = -0.3;
    wingPivot.add(wing);
    bodyG.add(wingPivot);
  }

  // Patas zancudas
  for (const sx of [-0.12, 0.12]) {
    limb(bodyG, 'Leg', [sx, 0.18, 0], cyl(0.025, 0.025, longNeck ? 0.7 : 0.3, mat(0x495057)), -(longNeck ? 0.35 : 0.15));
  }

  root.add(bodyG);
  return { root, bodyG };
}

function birdIdle() {
  const breath = scaleTrack('Body', [[0, 1, 1, 1], [1.2, 1.015, 1.01, 1], [2.4, 1, 1, 1]]);
  return new THREE.AnimationClip('Idle', 2.4, [breath]);
}

function birdFly() {
  const wingFlapL = sinRotTrack('Wing', 'x', -0.9, 0.6, 2.4, 0);
  const wingFlapR = sinRotTrack('Wing', 'x', 0.9, 0.6, 2.4, Math.PI);
  return new THREE.AnimationClip('Fly', 2.4, [wingFlapL, wingFlapR]);
}

function buildHedgehog() {
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  bodyG.name = 'Body';
  const body = sph(0.5, mat(0x6b4c35));
  body.scale.set(1, 0.85, 1.3);
  body.position.y = 0.4;
  bodyG.add(body);
  // Púas
  const spike = new THREE.ConeGeometry(0.06, 0.22, 6);
  const spikeMat = mat(0x4a3a28);
  const spikes = new THREE.InstancedMesh(spike, spikeMat, 14);
  let k = 0;
  for (let i = 0; i < 14; i += 1) {
    const ang = (i / 14) * Math.PI * 2;
    const rad = 0.4 + (i % 3) * 0.08;
    const m = new THREE.Matrix4().makeTranslation(Math.cos(ang) * rad * 0.8, 0.55 + (i % 2) * 0.08, Math.sin(ang) * rad);
    spikes.setMatrixAt(k, m); k += 1;
  }
  spikes.count = k;
  spikes.castShadow = true;
  bodyG.add(spikes);
  // Hocico
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 6), mat(0xd4a373));
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.35, 0.62);
  bodyG.add(snout);
  root.add(bodyG);
  return { root, bodyG };
}

function buildOwl() {
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  bodyG.name = 'Body';
  const body = cyl(0.34, 0.3, 0.8, mat(0x7f5539));
  body.position.y = 0.65;
  body.castShadow = true;
  bodyG.add(body);
  // Ojos
  for (const ox of [-0.12, 0.12]) {
    const eye = sph(0.08, mat(0xfec84d));
    eye.position.set(ox, 0.85, 0.26);
    bodyG.add(eye);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), mat(0xd4a373));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.78, 0.3);
  bodyG.add(beak);
  // Alas plegadas
  for (const sx of [-1, 1]) {
    const wing = box(0.14, 0.5, 0.22, mat(0x5f3f2a));
    wing.position.set(sx * 0.3, 0.7, 0);
    wing.rotation.z = sx * 0.2;
    wing.castShadow = true;
    bodyG.add(wing);
  }
  root.add(bodyG);
  return { root, bodyG };
}

/* -------------------------------------------------------------- exportación */
async function exportGlb(scene, animations, file) {
  return new Promise((resolvePromise, rejectPromise) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        const buf = Buffer.from(result);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, buf);
        console.log(`  ✓ ${file.split('/public/')[1]}  (${buf.length} B, ${animations.length} anim)`);
        resolvePromise();
      },
      (err) => rejectPromise(err),
      { binary: true, animations }
    );
  });
}

async function main() {
  // --- Humanoide: guardián (ranger)
  {
    const { root, parts } = buildHumanoid({ skin: 0xf5cba7, top: 0x00a88f, bottom: 0x1f2421, hat: 0x0b6e5e });
    const clips = [
      idleHumanPose(parts),
      walkHumanClip(parts, 1.0, 0.5, 1.0),
      walkHumanClip(parts, 0.5, 0.9, 0.5), // Run
      jumpHumanClip(parts),
    ];
    await exportGlb(root, clips, resolve(outDir, 'ranger.glb'));
  }
  // --- Humanoide: lugareño (npc)
  {
    const { root, parts } = buildHumanoid({ skin: 0xf0c8a0, top: 0x3a5a40, bottom: 0x4a4e69, hat: 0xd4a373 });
    const clips = [
      idleHumanPose(parts),
      walkHumanClip(parts, 1.1, 0.4, 1.1),
      talkHumanClip(parts),
    ];
    await exportGlb(root, clips, resolve(outDir, 'npc.glb'));
  }

  // --- Animales
  {
    const { root } = buildQuadruped({ color: 0x423124, accent: 0x2f221a, earMat: 0x423124, tail: true, scale: 1.3 });
    await exportGlb(root, [quadrupedIdle('tail')], resolve(outDir, 'animals/jabali.glb'));
  }
  {
    const { root } = buildQuadruped({ color: 0xc4b59d, accent: 0xddb892, earMat: 0xddb892, tail: true });
    await exportGlb(root, [quadrupedIdle('tail')], resolve(outDir, 'animals/conejo.glb'));
  }
  {
    const { root } = buildQuadruped({ color: 0xe07a5f, accent: 0xd04a2f, earMat: 0xe07a5f, tail: true });
    await exportGlb(root, [quadrupedIdle('tail')], resolve(outDir, 'animals/gato.glb'));
  }
  {
    const { root } = buildHedgehog();
    await exportGlb(root, [quadrupedIdle(undefined, { ears: false })], resolve(outDir, 'animals/erizo.glb'));
  }
  {
    const { root } = buildOwl();
    await exportGlb(root, [quadrupedIdle(undefined, { ears: false })], resolve(outDir, 'animals/mochuelo.glb'));
  }
  {
    const { root } = buildBird({ color: 0xadb5bd, wingMat: 0x495057, beakMat: 0xf39c12, longNeck: true });
    await exportGlb(root, [birdIdle()], resolve(outDir, 'animals/garza.glb'));
  }
  {
    const { root } = buildBird({ color: 0x6c757d, wingMat: 0x495057, beakMat: 0x343a40 });
    await exportGlb(root, [birdIdle()], resolve(outDir, 'animals/paloma.glb'));
  }
  {
    const { root } = buildBird({ color: 0xfafafa, wingMat: 0x8d99ae, beakMat: 0xfbc531 });
    await exportGlb(root, [birdIdle(), birdFly()], resolve(outDir, 'animals/gaviota.glb'));
  }

  console.log('\nModelos generados en public/models/');
}

main().catch((e) => { console.error(e); process.exit(1); });
