/**
 * Verifica el sistema de personajes del pack `media/Fantasy Character`:
 *  1. el manifiesto `config/characters.json` declara las 20 piezas y todas
 *     sus rutas (glb y texturas) existen en `public/`;
 *  2. `assembleCharacter` monta personajes completos en Node (GLTFLoader real
 *     vía fetch): altura ~1.85 m, un único esqueleto de 65 huesos compartido
 *     por todas las mallas, materiales nombrados del pack SIN emissive (el
 *     blanco del FBX vela el color), brazos relajados (la pose del FBX es
 *     en T) y cabeza de repuesto para el aldeano (el pack no trae otra);
 *  3. las variantes y los tonos de piel se reflejan en los materiales;
 *  4. el rig procedural balancea piernas adelante/atrás (sin desviarse de
 *     lado), los brazos en contrafase, y los codos/tobillos acompañan;
 *  5. el look del guardián se persiste en localStorage;
 *  6. los 6 NPC tienen aspecto predeterminado válido del pack.
 *
 * Ejecutar: node scripts/character-test.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';

const root = resolve(import.meta.dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gandia.test/' });
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true });
define('window', dom.window);
define('document', dom.window.document);
define('navigator', dom.window.navigator);
define('localStorage', dom.window.localStorage);
define('ProgressEvent', dom.window.ProgressEvent);

// fetch local: sirve cualquier archivo de public/ (glb, json y texturas).
define('fetch', async (input) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
  try {
    const buf = readFileSync(resolve(root, 'public', pathname));
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  } catch {
    return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  }
});

const { assembleCharacter, loadCharactersManifest, normalizeLook, lookId } = await import('../src/three/CharacterSystem.js');
const { saveGuardianLook, loadGuardianLook, defaultGuardianLook, GUARDIAN_LOOK_KEY } = await import('../src/three/CharacterSystem.js');
const { NPCS_DATA } = await import('../src/three/NPCs3D.js');

let failures = 0;
const expect = (condition, label) => {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) failures += 1;
};
const near = (value, target, tolerance = 0.02) => Math.abs(value - target) <= tolerance;
/** Materiales con emissive distinto de negro (el bug del "modelo blanco"). */
const emissiveOffenders = (assembled) => {
  const bad = [];
  assembled.meshes.forEach((m) => {
    const list = Array.isArray(m.material) ? m.material : [m.material];
    list.forEach((mat) => { if (mat.emissive && mat.emissive.getHex() !== 0) bad.push(mat.name); });
  });
  return [...new Set(bad)];
};

console.log('· Manifiesto de personajes (config/characters.json)');
const manifest = await loadCharactersManifest();
const parts = manifest.parts ?? [];
expect(parts.length === 20, `20 piezas declaradas (${parts.length})`);
const combos = new Set();
for (const part of parts) {
  combos.add(`${part.gender}/${part.outfit}`);
  expect(existsSync(resolve(root, 'public', part.glb)), `${part.id}: glb disponible`);
}
expect(combos.size === 4, 'cubre masculino/femenino × aldeano/guardabosques');
for (const part of parts) {
  if (part.slot === 'head' || part.slot === 'acc') {
    expect(part.outfit === 'ranger', `${part.id}: la pieza ${part.slot} sólo existe para guardabosques`);
  }
}
for (const cfg of Object.values(manifest.materials ?? {})) {
  const paths = [...(cfg.variants ?? []), cfg.map, cfg.normal, cfg.orm, cfg.roughness].filter(Boolean);
  for (const path of paths) expect(existsSync(resolve(root, 'public', path)), `textura disponible: ${path}`);
}

console.log('· Montaje de personajes (GLTFLoader real sobre HTTP local)');
{
  const look = { gender: 'female', outfit: 'ranger', variant: 2, pauldrons: true, skin: 'medium' };
  const assembled = await assembleCharacter(look);
  expect(!!assembled, 'monta un personaje completo del pack');
  if (assembled) {
    expect(assembled.meshes.length >= 5, `mallas del personaje (${assembled.meshes.length})`);
    expect(assembled.skeleton.bones.length === 65, 'esqueleto compartido de 65 huesos');
    expect(assembled.meshes.every((m) => m.skeleton === assembled.skeleton), 'todas las mallas comparten el mismo esqueleto');
    // Las inverseBindMatrices del esqueleto compartido deben ser las del GLB
    // (pose de enlace real). Si se recalculan, el personaje se dibuja tumbado.
    const bodyPart = parts.find((p) => p.gender === 'female' && p.outfit === 'ranger' && p.slot === 'body');
    const glbBuf = readFileSync(resolve(root, 'public', bodyPart.glb));
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const baseGltf = await new Promise((res) => new GLTFLoader().parse(
      glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength), '', res, () => res(null),
    ));
    let baseSkin = null;
    baseGltf?.scene.traverse((n) => { if (!baseSkin && n.isSkinnedMesh) baseSkin = n; });
    const ibmPreserved = baseSkin && assembled.skeleton.boneInverses.length === baseSkin.skeleton.boneInverses.length
      && assembled.skeleton.boneInverses.every((m, i) => m.equals(baseSkin.skeleton.boneInverses[i]));
    expect(!!ibmPreserved, 'el esqueleto compartido hereda las inverseBindMatrices del GLB (bind pose real)');

    // Medición como la hace el RENDERIZADOR del navegador: scene.update-
    // MatrixWorld refresca bindMatrixInverse (attached) y esa es la pose que
    // se dibuja. Es la que detecta el bug del "modelo tumbado".
    const scene = new THREE.Scene();
    scene.add(assembled.group);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(assembled.group, true);
    const size = box.getSize(new THREE.Vector3());
    expect(near(size.y, 1.85, 0.03), `altura normalizada a 1.85 m (${size.y.toFixed(2)})`);
    expect(near(box.min.y, 0, 0.03), `pies en el suelo (y = 0, ${box.min.y.toFixed(3)})`);
    // Un personaje DE PIE es alto y delgado en profundidad. La losa tumbada
    // del bug medía x≈8 / z≈8.8 con y=1.85 (su "alto" era el grosor), y la
    // pose en T sin relajar ensancha a x≈1.7-2.1.
    expect(size.z < 0.8 && size.x < 1.1, `de pie, delgado y sin pose en T (x=${size.x.toFixed(2)}, z=${size.z.toFixed(2)})`);
    const headY = assembled.skeleton.getBoneByName('Head').getWorldPosition(new THREE.Vector3()).y;
    const pelvisY = assembled.skeleton.getBoneByName('pelvis').getWorldPosition(new THREE.Vector3()).y;
    expect(headY > 1.2 && headY < 2.1, `cabeza arriba tras el ajuste (y=${headY.toFixed(2)})`);
    expect(pelvisY > 0.7 && pelvisY < 1.3, `pelvis a media altura (y=${pelvisY.toFixed(2)})`);
    // Brazos relajados: las manos cuelgan por debajo de los hombros y cerca
    // del costado (en T quedarían a |x|≈0.85, a la altura del hombro).
    const handL = assembled.skeleton.getBoneByName('hand_l').getWorldPosition(new THREE.Vector3());
    const shoulderL = assembled.skeleton.getBoneByName('upperarm_l').getWorldPosition(new THREE.Vector3());
    expect(
      Math.abs(handL.x) < 0.5 && handL.y < shoulderL.y - 0.2,
      `brazos colgando (mano x=${handL.x.toFixed(2)}, y=${handL.y.toFixed(2)})`,
    );
    // Sin emissive: el FBX trae emissive blanco y vela al personaje.
    expect(emissiveOffenders(assembled).length === 0, 'materiales sin emissive (no velado blanco)');
    const names = new Set();
    assembled.meshes.forEach((m) => {
      const list = Array.isArray(m.material) ? m.material : [m.material];
      list.forEach((mat) => names.add(mat.name));
    });
    expect([...names].every((n) => /^MI_/.test(n)), `materiales nombrados del pack (${[...names].join(', ')})`);
    expect(assembled.id === lookId(look), 'id del montaje coherente con el look');
  }
}

console.log('· Montaje masculino también en pie (inverseBindMatrices por género)');
{
  const assembled = await assembleCharacter({ gender: 'male', outfit: 'peasant', variant: 2, pauldrons: false, skin: 'light' });
  expect(!!assembled, 'monta un personaje masculino');
  if (assembled) {
    const scene = new THREE.Scene();
    scene.add(assembled.group);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(assembled.group, true);
    const size = box.getSize(new THREE.Vector3());
    expect(near(size.y, 1.85, 0.03), `masculino: altura 1.85 m (${size.y.toFixed(2)})`);
    expect(size.z < 0.8 && size.x < 1.1, `masculino: de pie, delgado y sin pose en T (x=${size.x.toFixed(2)}, z=${size.z.toFixed(2)})`);
    expect(near(box.min.y, 0, 0.03), 'masculino: pies en el suelo');
    // El pack no trae cabeza de aldeano: se reutiliza la capucha ranger.
    expect(
      assembled.meshes.some((m) => /head|hood/i.test(m.name)),
      `aldeano con cabeza (${assembled.meshes.map((m) => m.name).join(', ')})`,
    );
    expect(emissiveOffenders(assembled).length === 0, 'masculino: materiales sin emissive');
  }
}

console.log('· Animación procedural del rig (sin clips en el pack)');
{
  const { AnimatedEntity } = await import('../src/three/AnimatedEntity.js');
  const assembled = await assembleCharacter({ gender: 'female', outfit: 'ranger', variant: 1, pauldrons: true, skin: 'medium' });
  const entity = new AnimatedEntity({ label: 'prueba-rig', motion: 'idle', procedural: true });
  const scene = new THREE.Scene();
  scene.add(entity.root);
  entity.attachModelObject(assembled.group, assembled.source);
  scene.updateMatrixWorld(true);
  expect(!!entity._rig, 'captura el rig del pack (brazos/piernas/columna)');
  expect(
    (entity._rig?.groups.forearms.length ?? 0) === 2 && (entity._rig?.groups.feet.length ?? 0) === 2,
    'el rig incluye codos y tobillos',
  );
  if (entity._rig) {
    const foot = assembled.skeleton.getBoneByName('foot_l');
    const hand = assembled.skeleton.getBoneByName('hand_r');
    const handL = assembled.skeleton.getBoneByName('hand_l');
    const restZ = foot.getWorldPosition(new THREE.Vector3()).z;
    const restHandZ = hand.getWorldPosition(new THREE.Vector3()).z;
    entity.setMotion('walk');
    let swing = 0;
    let handSwing = 0;
    // Series del ciclo (mismo lado) para simetría y contrafase. Se miden
    // sobre la media de la ventana: el balanceo del torso añade un deriva
    // común que no debe sesgar el signo.
    const footDz = [];
    const handDz = [];
    let footDx = 0;
    for (let i = 0; i < 240; i += 1) {
      entity.update(1 / 60, i / 60);
      scene.updateMatrixWorld(true);
      const fz = foot.getWorldPosition(new THREE.Vector3()).z - restZ;
      const hz = hand.getWorldPosition(new THREE.Vector3()).z - restHandZ;
      swing = Math.max(swing, Math.abs(fz));
      handSwing = Math.max(handSwing, Math.abs(hz));
      if (i >= 30) { // transitorio de entrar al paso ya asentado
        footDz.push(fz);
        handDz.push(handL.getWorldPosition(new THREE.Vector3()).z);
      }
    }
    // Segundo ciclo para la desviación lateral (desde el reposo asentado).
    entity.setMotion('idle');
    for (let i = 0; i < 30; i += 1) entity.update(1 / 60, i / 60);
    scene.updateMatrixWorld(true);
    const restX = foot.getWorldPosition(new THREE.Vector3()).x;
    entity.setMotion('walk');
    for (let i = 0; i < 240; i += 1) {
      entity.update(1 / 60, i / 60);
      scene.updateMatrixWorld(true);
      if (i >= 30) footDx = Math.max(footDx, Math.abs(foot.getWorldPosition(new THREE.Vector3()).x - restX));
    }
    expect(swing > 0.15, `al caminar las piernas se balancean (${swing.toFixed(2)} m)`);
    expect(handSwing > 0.05, `al caminar los brazos se balancean (${handSwing.toFixed(2)} m)`);
    // Simetría: el pie va tanto adelante como atrás del reposo…
    const mean = (list) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
    const fMean = mean(footDz);
    const fwd = Math.max(...footDz) - fMean;
    const bwd = fMean - Math.min(...footDz);
    expect(fwd > 0.1 && bwd > 0.1, `la zancada es simétrica (adelante ${fwd.toFixed(2)}, atrás ${bwd.toFixed(2)})`);
    // …y no se desvía de lado (el bug componía el giro en el eje del reposo).
    expect(footDx < 0.15, `el pie no se desvía de lado (${footDx.toFixed(3)} m)`);
    // Contrafase: el brazo izquierdo va al contrario que el pie izquierdo.
    const hMean = mean(handDz);
    let against = 0;
    let total = 0;
    for (let i = 0; i < footDz.length; i += 1) {
      const f = footDz[i] - fMean;
      const h = handDz[i] - hMean;
      if (Math.abs(f) < 0.03 || Math.abs(h) < 0.015) continue; // pasos por cero
      total += 1;
      if (Math.sign(f) !== Math.sign(h)) against += 1;
    }
    expect(total > 40 && against / total > 0.65, `brazos en contrafase (${against}/${total} muestras)`);
    // Salto: los brazos se elevan hacia delante-arriba.
    const restHandY = handL.getWorldPosition(new THREE.Vector3()).y;
    entity.setMotion('jump');
    for (let i = 0; i < 60; i += 1) entity.update(1 / 60, i / 60);
    scene.updateMatrixWorld(true);
    const jumpHandY = handL.getWorldPosition(new THREE.Vector3()).y;
    expect(jumpHandY > restHandY + 0.15, `al saltar los brazos se elevan (+${(jumpHandY - restHandY).toFixed(2)} m)`);
    entity.setMotion('idle');
    for (let i = 0; i < 30; i += 1) entity.update(1 / 60, i / 60);
    scene.updateMatrixWorld(true);
    expect(Math.abs(foot.getWorldPosition(new THREE.Vector3()).z - restZ) < 0.06, 'en reposo las piernas vuelven a la pose de reposo');
  }
  entity.dispose();
}
{
  // Tono de piel: cambia el tinte del material de piel (MI_Regular_*).
  const dark = await assembleCharacter({ gender: 'male', outfit: 'peasant', variant: 1, pauldrons: false, skin: 'dark' });
  const light = await assembleCharacter({ gender: 'male', outfit: 'peasant', variant: 1, pauldrons: false, skin: 'light' });
  const skinColor = (a) => {
    let color = null;
    a.meshes.forEach((m) => {
      const list = Array.isArray(m.material) ? m.material : [m.material];
      list.forEach((mat) => { if (/^MI_Regular_/.test(mat.name)) color = mat.color.r; });
    });
    return color;
  };
  expect(dark && light && skinColor(light) > skinColor(dark), 'los tonos de piel cambian el tinte de la piel');
  // Variante de color: cambia la textura base pedida (map distinto).
  const v1 = await assembleCharacter({ gender: 'male', outfit: 'ranger', variant: 1, pauldrons: false, skin: 'dark' });
  const v2 = await assembleCharacter({ gender: 'male', outfit: 'ranger', variant: 2, pauldrons: false, skin: 'dark' });
  expect(v1 && v2 && v1.id !== v2.id, 'las variantes de tejido producen looks distintos');
}

console.log('· Persistencia del look del guardián');
{
  const custom = { gender: 'male', outfit: 'peasant', variant: 2, pauldrons: false, skin: 'dark' };
  saveGuardianLook(custom);
  expect(localStorage.getItem(GUARDIAN_LOOK_KEY)?.includes('"male"'), 'el look se guarda en localStorage');
  const loaded = loadGuardianLook();
  expect(lookId(loaded) === lookId(custom), 'el look guardado se recupera idéntico');
  localStorage.removeItem(GUARDIAN_LOOK_KEY);
  expect(lookId(loadGuardianLook()) === lookId(defaultGuardianLook()), 'sin look guardado se usa el por defecto');
}

console.log('· Aspecto predeterminado de los NPC');
for (const [zoneId, npc] of Object.entries(NPCS_DATA)) {
  const ok = npc.look && normalizeLook(npc.look) && ['male', 'female'].includes(normalizeLook(npc.look).gender);
  expect(!!ok, `${zoneId} (${npc.id}): look del pack válido`);
}

console.log(failures === 0 ? '\n✓ Sistema de personajes validado' : `\n✗ ${failures} comprobaciones fallidas`);
process.exit(failures === 0 ? 0 : 1);
