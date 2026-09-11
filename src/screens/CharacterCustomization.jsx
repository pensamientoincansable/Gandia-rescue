import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowLeft, Check, Palette, RotateCcw, Shirt, Sparkles, UserRound } from 'lucide-react';
import {
  assembleCharacter, defaultGuardianLook, loadGuardianLook, lookId, saveGuardianLook,
} from '../three/CharacterSystem.js';
import { AnimatedEntity } from '../three/AnimatedEntity.js';

/**
 * Modo personalización — edita el aspecto del guardián jugable.
 *
 * El guardián se monta con el pack modular `media/Fantasy Character`
 * (CharacterSystem) y se previsualiza aquí en un escenario Three.js propio:
 * arrastrar para girar, rueda/pellizco para acercar y rotación automática al
 * soltar, con la animación procedural de reposo (respiración y balanceo). El
 * look elegido se guarda en localStorage y es el que usa `RescueVan` al
 * bajar a pie en los modos 3D.
 */

/** Opciones del personalizador (etiquetas i18n en el render). */
const OPTIONS = {
  genders: [
    { id: 'female', icon: '♀', label: 'charBodyFemale' },
    { id: 'male', icon: '♂', label: 'charBodyMale' },
  ],
  outfits: [
    { id: 'peasant', icon: '🧺', label: 'charOutfitPeasant', swatch: '#8a6a45' },
    { id: 'ranger', icon: '🏹', label: 'charOutfitRanger', swatch: '#46543f' },
  ],
  variants: [
    { id: 1, label: 'charVariantOne' },
    { id: 2, label: 'charVariantTwo' },
  ],
  skins: [
    { id: 'dark', label: 'charSkinDark', color: '#8a5a3a' },
    { id: 'medium', label: 'charSkinMedium', color: '#b98a63' },
    { id: 'light', label: 'charSkinLight', color: '#d9b08c' },
  ],
};

/** Tinte aproximado del swatch de cada variante (para pintar los botones). */
function variantSwatch(outfit, variant) {
  const base = outfit === 'peasant' ? { one: '#9c7b52', two: '#6f5a7a' } : { one: '#4c5f46', two: '#5b4a3f' };
  return variant === 2 ? base.two : base.one;
}

function useCharacterPreview(look) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const rebuildRef = useRef(null);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const state = {
      renderer: null,
      scene: null,
      camera: null,
      entity: null,
      raf: 0,
      assembling: 0,
      yaw: 0.6,
      pitch: 0.04,
      distance: 3.6,
      targetYaw: 0.6,
      dragging: false,
      lastX: 0,
      lastY: 0,
      lastMove: 0,
      disposed: false,
    };

    // ---- escena ----
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // Sin WebGL (navegador antiguo o entorno de pruebas): el panel de
      // opciones sigue funcionando, sólo falta la previsualización 3D.
      renderer = null;
    }
    if (!renderer) {
      stateRef.current = state;
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0b1110, 1);
    mount.appendChild(renderer.domElement);
    state.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1412);
    scene.fog = new THREE.Fog(0x0d1412, 7, 18);
    state.scene = scene;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    state.camera = camera;

    const hemi = new THREE.HemisphereLight(0xd8e4ff, 0x23302c, 1.25);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2dc, 2.4);
    key.position.set(2.6, 4.2, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -1;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fd4c1, 1.1);
    rim.position.set(-3, 2.2, -2.6);
    scene.add(rim);

    // Plataforma
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.35, 0.16, 48),
      new THREE.MeshStandardMaterial({ color: 0x1c2825, roughness: 0.9, metalness: 0.05 }),
    );
    platform.position.y = -0.08;
    platform.receiveShadow = true;
    scene.add(platform);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.26, 1.32, 48),
      new THREE.MeshBasicMaterial({ color: 0x2c423c, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    // ---- personaje (con respiración/balanceo de reposo) ----
    // Una sola entidad reutilizada entre looks: cada rebuild intercambia el
    // modelo en caliente y recaptura su rig, sin recrear la escena.
    const entity = new AnimatedEntity({ label: 'preview', motion: 'idle', procedural: true });
    scene.add(entity.root);
    state.entity = entity;
    const rebuild = async () => {
      const seq = (state.assembling += 1);
      try {
        const result = await assembleCharacter(lookRef.current);
        if (state.disposed || seq !== state.assembling) return;
        if (result) entity.attachModelObject(result.group, result.source);
        else entity.detachModel();
      } catch {
        if (state.disposed || seq !== state.assembling) return;
        entity.detachModel();
      }
    };
    rebuildRef.current = rebuild;
    rebuild();

    // ---- redimensionado ----
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(mount);
    } else {
      window.addEventListener('resize', resize);
    }

    // ---- interacción ----
    const applyCamera = () => {
      camera.position.set(
        Math.sin(state.yaw) * Math.cos(state.pitch) * state.distance,
        1.05 + Math.sin(state.pitch) * state.distance,
        Math.cos(state.yaw) * Math.cos(state.pitch) * state.distance,
      );
      camera.lookAt(0, 0.98, 0);
    };

    const onPointerDown = (e) => {
      state.dragging = true;
      state.lastX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      state.lastY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      mount.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!state.dragging) return;
      const x = e.clientX ?? e.touches?.[0]?.clientX ?? state.lastX;
      const y = e.clientY ?? e.touches?.[0]?.clientY ?? state.lastY;
      state.yaw += (x - state.lastX) * 0.008;
      state.pitch = Math.max(-0.25, Math.min(0.85, state.pitch + (y - state.lastY) * 0.006));
      state.targetYaw = state.yaw;
      state.lastX = x;
      state.lastY = y;
      state.lastMove = performance.now();
    };
    const onPointerUp = () => {
      state.dragging = false;
      state.lastMove = performance.now();
    };
    const onWheel = (e) => {
      e.preventDefault();
      state.distance = Math.max(2.4, Math.min(6.5, state.distance + (e.deltaY > 0 ? 0.16 : -0.16)));
    };
    mount.addEventListener('pointerdown', onPointerDown);
    mount.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    mount.addEventListener('wheel', onWheel, { passive: false });

    // ---- bucle ----
    const clock = new THREE.Clock();
    const loop = () => {
      if (state.disposed) return;
      state.raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.1);
      // Auto-rotación suave al soltar el ratón.
      if (!state.dragging && performance.now() - state.lastMove > 2200) {
        state.yaw += dt * 0.22;
        state.targetYaw = state.yaw;
      }
      state.yaw += (state.targetYaw - state.yaw) * Math.min(1, dt * 6);
      entity.update(dt);
      applyCamera();
      renderer.render(scene, camera);
    };
    loop();

    stateRef.current = state;
    return () => {
      state.disposed = true;
      cancelAnimationFrame(state.raf);
      entity.dispose();
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', resize);
      mount.removeEventListener('pointerdown', onPointerDown);
      mount.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      mount.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      stateRef.current = null;
      rebuildRef.current = null;
    };
  }, []);

  // Reconstruye el personaje al cambiar el look (con secuencia anti-carreras).
  useEffect(() => {
    rebuildRef.current?.();
  }, [look]);

  return mountRef;
}

export default function CharacterCustomization({ t, goMenu, notify }) {
  const [look, setLook] = useState(() => loadGuardianLook());
  const [savedId, setSavedId] = useState(() => lookId(loadGuardianLook()));
  const mountRef = useCharacterPreview(look);
  const defaultId = useMemo(() => lookId(defaultGuardianLook()), []);

  const set = useCallback((patch) => {
    setLook((prev) => ({ ...prev, ...patch }));
  }, []);

  const save = () => {
    const next = { ...look };
    saveGuardianLook(next);
    setSavedId(lookId(next));
    notify(t('charSaved'));
    goMenu();
  };

  const reset = () => {
    setLook(defaultGuardianLook());
  };

  const isSaved = lookId(look) === savedId;
  const isDefault = lookId(look) === defaultId;

  return (
    <main className="char-screen screen-enter">
      <header className="char-topbar">
        <button className="char-back" onClick={goMenu} aria-label={t('charBack')}>
          <ArrowLeft size={18} />{t('charBack')}
        </button>
        <div className="char-topbar__title">
          <span className="char-topbar__icon"><Palette size={18} /></span>
          <div><h1>{t('customizeTitle')}</h1><p>{t('customizeDesc')}</p></div>
        </div>
        <span className="char-topbar__badge"><UserRound size={15} />{t('player')}</span>
      </header>

      <div className="char-layout">
        <aside className="char-panel glass-panel">
          <section className="char-section">
            <h2><UserRound size={15} />{t('charBody')}</h2>
            <div className="char-options char-options--2">
              {OPTIONS.genders.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`char-option ${look.gender === option.id ? 'is-active' : ''}`}
                  onClick={() => set({ gender: option.id })}
                >
                  <span className="char-option__glyph">{option.icon}</span>
                  <span>{t(option.label)}</span>
                  {look.gender === option.id && <i><Check size={12} /></i>}
                </button>
              ))}
            </div>
          </section>

          <section className="char-section">
            <h2><Shirt size={15} />{t('charOutfit')}</h2>
            <div className="char-options char-options--2">
              {OPTIONS.outfits.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`char-option ${look.outfit === option.id ? 'is-active' : ''}`}
                  onClick={() => set({ outfit: option.id })}
                >
                  <span className="char-option__swatch" style={{ background: option.swatch }} />
                  <span>{t(option.label)}</span>
                  {look.outfit === option.id && <i><Check size={12} /></i>}
                </button>
              ))}
            </div>
          </section>

          <section className="char-section">
            <h2><Sparkles size={15} />{t('charColors')}</h2>
            <div className="char-options char-options--2">
              {OPTIONS.variants.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`char-option ${look.variant === option.id ? 'is-active' : ''}`}
                  onClick={() => set({ variant: option.id })}
                >
                  <span
                    className="char-option__swatch"
                    style={{ background: variantSwatch(look.outfit, option.id) }}
                  />
                  <span>{t(option.label)}</span>
                  {look.variant === option.id && <i><Check size={12} /></i>}
                </button>
              ))}
            </div>
          </section>

          {look.outfit === 'ranger' && (
            <section className="char-section">
              <h2><ShieldIcon />{t('charShoulders')}</h2>
              <div className="char-options char-options--2">
                <button
                  type="button"
                  className={`char-option ${look.pauldrons ? 'is-active' : ''}`}
                  onClick={() => set({ pauldrons: true })}
                >
                  <span className="char-option__glyph">🛡</span>
                  <span>{t('charShouldersOn')}</span>
                  {look.pauldrons && <i><Check size={12} /></i>}
                </button>
                <button
                  type="button"
                  className={`char-option ${!look.pauldrons ? 'is-active' : ''}`}
                  onClick={() => set({ pauldrons: false })}
                >
                  <span className="char-option__glyph">—</span>
                  <span>{t('charShouldersOff')}</span>
                  {!look.pauldrons && <i><Check size={12} /></i>}
                </button>
              </div>
            </section>
          )}

          <section className="char-section">
            <h2><UserRound size={15} />{t('charSkin')}</h2>
            <div className="char-options char-options--3">
              {OPTIONS.skins.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`char-option ${look.skin === option.id ? 'is-active' : ''}`}
                  onClick={() => set({ skin: option.id })}
                >
                  <span className="char-option__swatch char-option__swatch--round" style={{ background: option.color }} />
                  <span>{t(option.label)}</span>
                  {look.skin === option.id && <i><Check size={12} /></i>}
                </button>
              ))}
            </div>
          </section>

          <section className="char-section char-section--note">
            <h2><Shirt size={15} />{t('charHead')}</h2>
            <p>{t('charHeadHood')}</p>
          </section>
        </aside>

        <section className="char-stage">
          <div className="char-stage__canvas" ref={mountRef} role="img" aria-label={t('customizeTitle')} />
          <div className="char-stage__hint">{t('charHint')}</div>
          <div className="char-stage__status">
            <span className={isSaved ? 'is-saved' : 'is-dirty'}>
              {isSaved ? <Check size={13} /> : <Palette size={13} />}
              {isSaved ? t('charSaved') : t('charUnsaved')}
            </span>
          </div>
        </section>
      </div>

      <footer className="char-actions">
        <button className="char-actions__ghost" onClick={reset} disabled={isDefault}>
          <RotateCcw size={16} />{t('charReset')}
        </button>
        <button className="modal-primary char-actions__save" onClick={save}>
          <Check size={18} />{t('charSave')}
        </button>
      </footer>
    </main>
  );
}

/** Hombreras: icono sencillo (escudo de lucide no es necesario). */
function ShieldIcon() {
  return <span className="char-section__glyph" aria-hidden="true">🛡</span>;
}
