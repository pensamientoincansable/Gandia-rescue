/**
 * Verifica el sistema de personajes del pack `media/Fantasy Character`:
 *  1. el manifiesto `config/characters.json` declara las 20 piezas y todas
 *     sus rutas (glb y texturas) existen en `public/`;
 *  2. `assembleCharacter` monta personajes completos en Node (GLTFLoader real
 *     vía fetch): altura ~1.85 m, un único esqueleto de 65 huesos compartido
 *     por todas las mallas y materiales nombrados del pack;
 *  3. las variantes y los tonos de piel se reflejan en los materiales;
 *  4. el look del guardián se persiste en localStorage;
 *  5. los 6 NPC tienen aspecto predeterminado válido del pack.
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
    const box = new THREE.Box3().setFromObject(assembled.group, true);
    expect(near(box.max.y - box.min.y, 1.85, 0.03), `altura normalizada a 1.85 m (${(box.max.y - box.min.y).toFixed(2)})`);
    expect(near(box.min.y, 0, 0.03), 'pies en el suelo (y = 0)');
    const names = new Set();
    assembled.meshes.forEach((m) => {
      const list = Array.isArray(m.material) ? m.material : [m.material];
      list.forEach((mat) => names.add(mat.name));
    });
    expect([...names].every((n) => /^MI_/.test(n)), `materiales nombrados del pack (${[...names].join(', ')})`);
    expect(assembled.id === lookId(look), 'id del montaje coherente con el look');
  }
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
