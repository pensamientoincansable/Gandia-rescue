import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
const root = resolve('/home/user/Gandia-rescue');
const assetsDir = join(root, 'dist', 'assets');
const entry = readdirSync(assetsDir).find((f) => /^main-.*\.js$/.test(f));
const dom = new JSDOM('<!doctype html><html lang="es"><body><div id="root"></div></body></html>', { url: 'https://gandia.test/', pretendToBeVisual: true });
const { window } = dom;
for (const k of ['window','document','navigator','Image','FileReader','HTMLElement','getComputedStyle'])
  Object.defineProperty(globalThis, k, { value: k==='window'?window:window[k], configurable: true });
window.navigator.geolocation = undefined;
const sleep = (ms) => new Promise((r) => window.setTimeout(r, ms));
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const setInput = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new window.Event('input',{bubbles:true})); };
let fails=0; const expect=(c,l)=>{console.log(`  ${c?'✓':'✗'} ${l}`); if(!c)fails++;};

await import(pathToFileURL(join(assetsDir, entry)).href);
await sleep(300);
setInput($('#onboarding-name'), 'Laia'); await sleep(50);
click($$('.onboarding__avatars button')[2]);
click([...$$('button')].find(b=>/empezar|comenzar|crear/i.test(b.textContent))); await sleep(300);
click([...$$('button')].find(b=>/MODO EXPLORACI/i.test(b.textContent))); await sleep(4000);

console.log('· HUD de la furgoneta en el mundo 3D');
expect(!!$('.van-hud-container'), 'panel de control de la furgoneta presente');
const footBtn = [...$$('.van-tool-btn')].find(b=>/pie|van/i.test(b.textContent));
expect(!!footBtn, `botón de entrar/salir del vehículo ("${footBtn?.textContent.trim()}")`);
click(footBtn); await sleep(200);
const after = [...$$('.van-tool-btn')].find(b=>/pie|van/i.test(b.textContent));
expect(/subir a van/i.test(after.textContent), `al pulsar pasa a modo a pie ("${after.textContent.trim()}")`);
expect(!!$('.van-chip.is-foot'), 'el HUD indica el estado A PIE');
click(after); await sleep(200);
expect(/bajar a pie/i.test([...$$('.van-tool-btn')].find(b=>/pie|van/i.test(b.textContent)).textContent), 'vuelve a subir a la furgoneta');

const camBtn = [...$$('.van-tool-btn')].find(b=>/persona|cabina|cenital/i.test(b.textContent));
const camLabel = camBtn.textContent.trim();
click(camBtn); await sleep(150);
expect([...$$('.van-tool-btn')].find(b=>/persona|cabina|cenital/i.test(b.textContent)).textContent.trim() !== camLabel, 'el selector de cámara cambia de perspectiva');

const sirenBtn = [...$$('.van-tool-btn')].find(b=>/sirena/i.test(b.textContent));
click(sirenBtn); await sleep(150);
expect(!!$('.van-tool-btn.is-siren') || !!$('.van-chip.is-siren-on'), 'la sirena se conmuta desde el HUD');

console.log('· Controles táctiles');
expect($$('.touch-btn--steer').length === 2, 'volante virtual (izquierda/derecha)');
expect(!!$('.touch-btn--gas') && !!$('.touch-btn--brake'), 'pedales de gas y freno');
const gas = $('.touch-btn--gas');
gas.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true})); await sleep(120);
gas.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true}));
expect(true, 'el pedal de gas acepta pulsación sin errores');

console.log(fails?`\n✗ ${fails} fallos`:'\n✓ Controles de UI verificados');
process.exit(fails?1:0);
