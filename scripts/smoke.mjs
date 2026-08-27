/**
 * Prueba de humo end-to-end sin navegador: monta el bundle de producción en
 * jsdom y recorre el flujo principal (onboarding → menú → rescate → refugio →
 * exploración). Se ejecuta con: node scripts/smoke.mjs
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = resolve(import.meta.dirname, '..');
const assetsDir = join(root, 'dist', 'assets');
if (!existsSync(assetsDir)) {
  console.error('✗ Falta dist/. Ejecuta primero: npx vite build');
  process.exit(1);
}
const entry = readdirSync(assetsDir).find((f) => /^main-.*\.js$/.test(f));
if (!entry) { console.error('✗ No se encuentra el bundle en dist/assets'); process.exit(1); }

const dom = new JSDOM('<!doctype html><html lang="es"><body><div id="root"></div></body></html>', {
  url: 'https://gandia.test/',
  pretendToBeVisual: true,
});

const { window } = dom;
Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
Object.defineProperty(globalThis, 'Image', { value: window.Image, configurable: true });
Object.defineProperty(globalThis, 'FileReader', { value: window.FileReader, configurable: true });
Object.defineProperty(globalThis, 'HTMLElement', { value: window.HTMLElement, configurable: true });
Object.defineProperty(globalThis, 'getComputedStyle', { value: window.getComputedStyle, configurable: true });
window.navigator.geolocation = undefined; // sin GPS en el test

const sleep = (ms) => new Promise((r) => { window.setTimeout(r, ms); });
const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const setInput = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

let failures = 0;
const expect = (cond, label) => {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures += 1; console.error(`  ✗ ${label}`); }
};

console.log('· Montando bundle…');
await import(pathToFileURL(join(assetsDir, entry)).href);
await sleep(300);

console.log('· Onboarding');
expect($('.onboarding'), 'se muestra la creación de perfil');
expect($$('.onboarding__avatars button').length === 6, '6 avatares disponibles');
setInput($('#onboarding-name'), 'Laia Martí');
await sleep(50);
click($$('.onboarding__avatars button')[2]);
await sleep(50);
click($('.onboarding__start'));
await sleep(400);

console.log('· Menú principal');
expect($('.menu-screen'), 'se muestra el menú');
expect(window.document.body.textContent.includes('Laia Martí'), 'aparece el nombre del perfil');
expect(window.document.body.textContent.includes('Nv. 1'), 'empieza en nivel 1');
expect($$('.mode-card').length === 3, 'tres modos: rescate, exploración y refugio');

console.log('· Modo rescate (geolocalización)');
click($('.mode-card--rescue'));
await sleep(200);
expect($('.loading-screen'), 'pantalla de carga');
await sleep(2600);
expect($('.rescue-game'), 'escena de rescate cargada');
expect($('.pano'), 'visor 360° montado');
expect($('.case-card'), 'tarjeta de aviso activo');
expect($('.radar'), 'radar de avisos');
expect($('.zone-photos'), 'sección de fotos de la zona');
click($('.case-intervene'));
await sleep(200);
expect($('.care-sheet'), 'hoja de protocolo de ayuda');
click($$('.care-actions button')[0]);
await sleep(200);
expect($('.success-toast'), 'aviso de rescate completado');
expect(window.document.body.textContent.includes('+'), 'XP otorgada');
click($('.success-toast__close'));
await sleep(200);

console.log('· Modo refugio');
click($('.game-back'));
await sleep(250);
click($$('.mode-card')[2]);
await sleep(200);
await sleep(2600);
expect($('.shelter-screen'), 'escena del refugio cargada');
expect($$('.catalog-card').length === 14, 'catálogo con 14 elementos');
expect($$('.catalog-card.is-locked').length === 12, '12 elementos bloqueados en nivel 1');
click($$('.catalog-card:not(.is-locked)')[0]);
await sleep(100);
click($$('.shelter-tile')[18]);
await sleep(100);
expect($$('.shelter-item').length === 1, 'elemento colocado en la loseta');
click($$('.shelter-tabs button')[2]);
await sleep(100);
expect($$('.fauna-row').length === 8, 'lista de fauna del refugio');
click($('.game-back'));
await sleep(250);

console.log('· Modo exploración (virtual)');
click($$('.mode-card')[1]);
await sleep(200);
await sleep(2600);
expect($('.explore-game'), 'escena de exploración cargada');
expect($$('.mission-row').length === 1, 'misión de la zona inicial');
click($$('.mission-row')[0]);
await sleep(200);
expect($('.care-sheet'), 'misión disponible en exploración');
expect($('.care-sheet__noxp'), 'aviso de que no da XP');
click($$('.care-actions button')[0]);
await sleep(200);
expect($('.success-toast'), 'misión completada en exploración');
expect(window.document.body.textContent.includes('no otorga XP'), 'sin XP en modo virtual');
click($('.success-toast__close'));
await sleep(200);
click($$('.quick-actions button')[1]);
await sleep(200);
expect($('.travel-map'), 'mapa de viaje virtual');
click($$('.travel-map__node')[4]);
await sleep(300);
expect(window.document.body.textContent.includes('Montdúver') || window.document.body.textContent.includes('Mondúver'), 'viaje virtual a otra zona');

console.log('· Persistencia');
const stored = JSON.parse(window.localStorage.getItem('gandia-save-v2'));
expect(stored?.profile?.name === 'Laia Martí', 'perfil guardado');
expect(stored?.xp > 0, 'XP persistida tras el rescate');
const totalRescues = Object.values(stored?.cases ?? {}).reduce((a, b) => a + b, 0);
expect(totalRescues === 2, 'rescates registrados (1 real + 1 virtual)');
expect((stored?.shelter?.placed ?? []).length === 1, 'refugio persistido');
expect(stored?.species?.length === 1, 'ficha de especie desbloqueada');

console.log(failures === 0 ? '\n✓ Prueba de humo superada' : `\n✗ ${failures} comprobaciones fallidas`);
window.close();
process.exit(failures === 0 ? 0 : 1);
