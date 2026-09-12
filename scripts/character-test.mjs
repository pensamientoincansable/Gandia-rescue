/**
 * Verifica el sistema de personajes del pack `media/glTF`:
 *  1. el manifiesto `config/characters.json` declara los 11 personajes y todas
 *     sus rutas (.glb) existen en `public/`;
 *  2. `assembleCharacter` monta personajes completos en Node (GLTFLoader real
 *     vía fetch): altura ~1.85 m con los pies en el suelo, un único esqueleto
 *     de 62 huesos que hereda las inverseBindMatrices del GLB, materiales
 *     saneados (sin emissive) y CABEZA real (la malla trae cara/pelo/ojos, no
 *     el ovoide procedural del pack anterior);
 *  3. el personaje trae sus 24 animaciones (Idle/Walk/Run/Interact/Wave…) y el
 *     mixer las reproduce: al caminar los pies se balancean;
 *  4. los tonos de piel tiñen el material `Skin` (claro > oscuro);
 *  5. el look del guardián se persiste en localStorage y los looks del pack
 *     anterior se migran al personaje por defecto;
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

// fetch local: sirve cualquier archivo de public/ (glb, json…).
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

const {
  assembleCharacter, loadCharactersManifest, normalizeLook, lookId,
  saveGuardianLook, loadGuardianLook, defaultGuardianLook, GUARDIAN_LOOK_KEY,
} = await import('../src/three/CharacterSystem.js');
const { AnimatedEntity } = await import('../src/three/AnimatedEntity.js');
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
const characters = manifest.characters ?? [];
expect(characters.length === 11, `11 personajes declarados (${characters.length})`);
const ids = new Set();
for (const character of characters) {
  ids.add(character.id);
  expect(existsSync(resolve(root, 'public', character.glb)), `${character.id}: glb disponible`);
}
expect(ids.has('Adventurer') && ids.has('Worker') && ids.has('Spacesuit'), 'incluye los personajes del pack media/glTF');
expect(Object.keys(manifest.animations ?? {}).includes('walk'), 'mapea la animación de caminar');

console.log('· Montaje de personajes (GLTFLoader real sobre HTTP local)');
{
  const look = { character: 'Adventurer', skin: 'medium' };
  const assembled = await assembleCharacter(look);
  expect(!!assembled, 'monta un personaje completo del pack');
  if (assembled) {
    expect(assembled.meshes.length >= 4, `mallas del personaje (${assembled.meshes.length})`);
    expect(assembled.skeleton.bones.length === 62, 'esqueleto compartido de 62 huesos');
    expect(assembled.meshes.every((m) => m.skeleton === assembled.skeleton), 'todas las mallas comparten el mismo esqueleto');
    expect((assembled.clips?.length ?? 0) === 24, `el personaje trae sus 24 animaciones (${assembled.clips?.length})`);
    expect(['Idle', 'Walk', 'Run'].every((n) => assembled.clips.some((c) => c.name === n)), 'incluye Idle, Walk y Run');

    // Medición como la hace el RENDERIZADOR del navegador.
    const scene = new THREE.Scene();
    scene.add(assembled.group);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(assembled.group, true);
    const size = box.getSize(new THREE.Vector3());
    expect(near(size.y, 1.85, 0.03), `altura normalizada a 1.85 m (${size.y.toFixed(2)})`);
    expect(near(box.min.y, 0, 0.03), `pies en el suelo (y = 0, ${box.min.y.toFixed(3)})`);
    expect(size.z < 0.9 && size.x < 1.1, `de pie, delgado y sin pose en T (x=${size.x.toFixed(2)}, z=${size.z.toFixed(2)})`);

    // CABEZA REAL: una malla esqueletada con materiales faciales (piel, pelo,
    // ojos…), no el ovoide rígido procedural del pack anterior.
    expect(!!assembled.head && assembled.head.isSkinnedMesh, 'la cabeza es una malla real del asset (esqueletada)');
    if (assembled.head) {
      const mats = Array.isArray(assembled.head.material) ? assembled.head.material : [assembled.head.material];
      const names = mats.map((m) => (m.name ?? '').toLowerCase()).join(',');
      expect(/skin|hair|eye|eyebrow|moustache|visor/i.test(names), `la cabeza trae materiales faciales (${names})`);
    }
    // El hueso de la cabeza queda arriba (cráneo real), no sustituido por un
    // ovoide flotante: comprobamos la anatomía del esqueleto.
    const headBone = assembled.skeleton.getBoneByName('Head');
    expect(!!headBone, 'el esqueleto incluye el hueso de la cabeza');
    if (headBone) {
      const headY = headBone.getWorldPosition(new THREE.Vector3()).y;
      expect(headY > 1.4 && headY < 1.9, `la cabeza está arriba, sobre el cuello (y=${headY.toFixed(2)})`);
    }

    expect(emissiveOffenders(assembled).length === 0, 'materiales sin emissive (no velado blanco)');
    expect(assembled.id === lookId(look), 'id del montaje coherente con el look');
    expect(assembled.source === `character:${lookId(look)}`, 'origen del montaje etiquetado');
  }
}

console.log('· Animaciones reales reproducidas por el mixer');
{
  const assembled = await assembleCharacter({ character: 'Worker', skin: 'medium' });
  expect(!!assembled, 'monta el obrero para probar el mixer');
  if (assembled) {
    const entity = new AnimatedEntity({ label: 'prueba-mixer', motion: 'idle', procedural: true });
    const scene = new THREE.Scene();
    scene.add(entity.root);
    entity.attachModelObject(assembled.group, assembled.source, {
      clips: assembled.clips,
      animations: assembled.animations,
    });
    expect(entity.isAnimated, 'la entidad reconoce las animaciones del asset');

    const foot = assembled.skeleton.getBoneByName('FootL');
    scene.updateMatrixWorld(true);
    const restZ = foot.getWorldPosition(new THREE.Vector3()).z;
    entity.setMotion('walk');
    let swing = 0;
    for (let i = 0; i < 240; i += 1) {
      entity.update(1 / 60, i / 60);
      scene.updateMatrixWorld(true);
      if (i >= 30) swing = Math.max(swing, Math.abs(foot.getWorldPosition(new THREE.Vector3()).z - restZ));
    }
    expect(swing > 0.12, `al caminar los pies se balancean (${swing.toFixed(2)} m)`);
    entity.dispose();
  }
}

console.log('· Tono de piel y variantes');
{
  const dark = await assembleCharacter({ character: 'Casual_2', skin: 'dark' });
  const light = await assembleCharacter({ character: 'Casual_2', skin: 'light' });
  const skinColor = (a) => {
    let color = null;
    a.meshes.forEach((m) => {
      const list = Array.isArray(m.material) ? m.material : [m.material];
      list.forEach((mat) => { if (/^skin/i.test(mat.name ?? '')) color = mat.color.r; });
    });
    return color;
  };
  expect(dark && light && skinColor(light) > skinColor(dark), 'los tonos de piel tiñen el material Skin (claro > oscuro)');
  const v1 = await assembleCharacter({ character: 'Adventurer', skin: 'dark' });
  const v2 = await assembleCharacter({ character: 'Worker', skin: 'dark' });
  expect(v1 && v2 && v1.id !== v2.id, 'cada personaje produce un look distinto');
}

console.log('· Persistencia y migración del look del guardián');
{
  const custom = { character: 'Punk', skin: 'dark' };
  saveGuardianLook(custom);
  expect(localStorage.getItem(GUARDIAN_LOOK_KEY)?.includes('"Punk"'), 'el look se guarda en localStorage');
  expect(lookId(loadGuardianLook()) === lookId(custom), 'el look guardado se recupera idéntico');

  // El look del pack anterior se migra sin romper nada (cae en el personaje
  // por defecto conservando el tono).
  const legacy = normalizeLook({ gender: 'female', outfit: 'ranger', variant: 2, pauldrons: true, skin: 'light' });
  expect(legacy.character === 'Adventurer' && legacy.skin === 'light', 'los looks antiguos se migran al personaje por defecto');

  localStorage.removeItem(GUARDIAN_LOOK_KEY);
  expect(lookId(loadGuardianLook()) === lookId(defaultGuardianLook()), 'sin look guardado se usa el por defecto');
}

console.log('· Aspecto predeterminado de los NPC');
for (const [zoneId, npc] of Object.entries(NPCS_DATA)) {
  const ok = npc.look
    && typeof npc.look.character === 'string'
    && ids.has(npc.look.character)
    && ['dark', 'medium', 'light'].includes(npc.look.skin);
  expect(!!ok, `${zoneId} (${npc.id}): look del pack válido (${npc.look?.character ?? '?'})`);
}

console.log(failures === 0 ? '\n✓ Sistema de personajes validado' : `\n✗ ${failures} comprobaciones fallidas`);
process.exit(failures === 0 ? 0 : 1);
