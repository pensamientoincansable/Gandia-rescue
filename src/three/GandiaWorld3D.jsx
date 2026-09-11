import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TerrainBuilder } from './TerrainBuilder.js';
import { InstancedElements } from './InstancedElements.js';
import { RescueVan } from './RescueVan.js';
import { Fauna3D } from './Fauna3D.js';
import { NPCs3D } from './NPCs3D.js';
import { Clues3D } from './Clues3D.js';
import { Atmosphere3D } from './Atmosphere3D.js';
import { CASES } from '../lib/game.js';
import { InputManager } from '../engine/InputManager.js';
import { DEFAULT_KEYBINDINGS, DEFAULT_PLAYER_STATS } from '../engine/defaults.js';
import { loadConfig } from '../engine/ConfigLoader.js';

/**
 * Traducción de acciones abstractas (keybindings.json) al vocabulario de
 * entrada que consume la física de la furgoneta. Cambiar una tecla ya no
 * requiere tocar este archivo: basta con editar `config/keybindings.json`.
 */
const ACTION_TO_DRIVE_INPUT = {
  MOVE_FORWARD: 'forward',
  MOVE_BACKWARD: 'backward',
  STEER_LEFT: 'left',
  STEER_RIGHT: 'right',
  HANDBRAKE: 'handbrake',
};

/**
 * Tope de pixelRatio del renderizador: en pantallas táctiles se limita a 1.5
 * (mismo aspecto visual, ~40% menos píxeles que sombrear por frame).
 * @returns {number}
 */
function maxPixelRatio() {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  return Math.min(dpr, coarse ? 1.5 : 2);
}

/**
 * Escenario 3D interactivo en Three.js para la exploración y rescate en Gandía.
 * Controla el ciclo de renderizado WebGL, la furgoneta de rescate,
 * los elementos instanciados, la fauna, los lugareños y las pistas.
 */

export default function GandiaWorld3D({
  zoneId = 'platja',
  cases = CASES,
  doneCases = {},
  onInteractAnimal,
  onTalkNPC,
  onInspectClue,
  onZoneTravel,
  onLookUpdate,
  virtualInput = null,
  photoModeActive = false,
  onCaptureReady,
  cameraMode = 'chase',
  isFootMode = false,
  sirenActive = false,
  headlightsActive = true,
  onToggleFootMode,
  onCycleCamera,
  onToggleSiren,
  onToggleHeadlights,
  onHonkReady,
  timePhase = null,
  onTimePhaseChange,
  cycleAuto = false,
  onToggleCycleAuto,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Referencias a los subsistemas Three.js
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const terrainRef = useRef(null);
  const instancedRef = useRef(null);
  const vanRef = useRef(null);
  const faunaRef = useRef(null);
  const npcsRef = useRef(null);
  const cluesRef = useRef(null);
  const atmosphereRef = useRef(null);

  const inputRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
    jump: false,
  });
  const inputManagerRef = useRef(null);
  // Espejos mutables para el bucle de animación: `animate` se crea UNA VEZ
  // (efecto con []) y leería valores congelados si accediera a `virtualInput`
  // o `zoneId` desde el closure —ese era el bug que dejaba quietos los
  // botones táctiles—. Estos efectos mantienen las copias al día sin recrear
  // el bucle ni la escena.
  const virtualInputRef = useRef({});
  const zoneRef = useRef(zoneId);
  useEffect(() => { zoneRef.current = zoneId; }, [zoneId]);
  useEffect(() => {
    if (virtualInput && typeof virtualInput === 'object') {
      Object.assign(virtualInputRef.current, virtualInput);
    }
  }, [virtualInput]);
  const statsRef = useRef(DEFAULT_PLAYER_STATS);
  const triggerContextInteractionRef = useRef(() => {});
  // La transición a pie debe ocurrir en RescueVan, que conserva la posición
  // mundial real de la furgoneta. React sólo recibe el estado resultante para
  // actualizar el HUD; nunca debe limitarse a cambiar un booleano.
  const toggleFootModeFromInput = () => {
    const nextMode = vanRef.current?.toggleFootMode();
    if (typeof nextMode === 'boolean') onToggleFootMode?.(nextMode);
    else onToggleFootMode?.();
  };
  const actionHandlersRef = useRef({});
  actionHandlersRef.current = {
    TOGGLE_FOOT_MODE: toggleFootModeFromInput,
    CYCLE_CAMERA: onCycleCamera,
    TOGGLE_SIREN: onToggleSiren,
    TOGGLE_HEADLIGHTS: onToggleHeadlights,
    // Ciclo día/noche: T avanza a la siguiente fase del cielo, Y activa el
    // avance automático. El estado vive en React; la escena se sincroniza
    // abajo con efectos dedicados.
    CYCLE_TIME: () => {
      const atmosphere = atmosphereRef.current;
      if (!atmosphere) return;
      const nextId = atmosphere.advancePhase(2);
      onTimePhaseChange?.(nextId);
    },
    TOGGLE_CYCLE: () => {
      const atmosphere = atmosphereRef.current;
      if (!atmosphere) return;
      const next = !atmosphere.cycleEnabled;
      atmosphere.setCycleEnabled(next);
      onToggleCycleAuto?.(next);
    },
  };

  const [nearbyTarget, setNearbyTarget] = useState(null); // { type: 'animal'|'npc'|'clue', data }

  // Exponer método de captura fotográfica
  useEffect(() => {
    if (onCaptureReady) {
      onCaptureReady(() => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;
        try {
          renderer.render(scene, camera);
          return renderer.domElement?.toDataURL ? renderer.domElement.toDataURL('image/jpeg', 0.88) : null;
        } catch (e) {
          return null;
        }
      });
    }
  }, [onCaptureReady]);

  /* ------------------------------------------------ Inicialización de Three.js */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    // 1. Escena y cámara
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const camCfg = statsRef.current.camera;
    const camera = new THREE.PerspectiveCamera(camCfg.fov, width / Math.max(1, height), camCfg.near, camCfg.far);
    cameraRef.current = camera;

    // 2. Renderizador WebGL seguro
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        // Sin búfer retenido: la captura de foto renderiza y lee el píxel en
        // la misma tarea (ver `onCaptureReady`), así que no lo necesita; en
        // móviles retenerlo lastra la GPU sin cambiar lo que se ve.
        preserveDrawingBuffer: false,
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(maxPixelRatio());
      if (renderer.shadowMap) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      rendererRef.current = renderer;
    } catch (e) {
      console.warn('[Gandía 3D] WebGL no disponible en este entorno:', e);
    }

    // 3. Módulos de juego
    const atmosphere = new Atmosphere3D(scene);
    atmosphereRef.current = atmosphere;

    const terrain = new TerrainBuilder(scene);
    terrainRef.current = terrain;

    const instanced = new InstancedElements(scene, terrain);
    instancedRef.current = instanced;

    const van = new RescueVan(scene, terrain, statsRef.current);
    vanRef.current = van;
    onHonkReady?.(() => van.honk());

    const fauna = new Fauna3D(scene, terrain);
    faunaRef.current = fauna;

    const npcs = new NPCs3D(scene, terrain);
    npcsRef.current = npcs;

    const clues = new Clues3D(scene, terrain);
    cluesRef.current = clues;

    // Cargar la zona inicial
    loadZone(zoneId);

    // 4. Redimensionado
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    ro?.observe(container);

    const safeRequestAnim = (fn) => (typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(fn, 16));
    const safeCancelAnim = (id) => (typeof window !== 'undefined' && window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id));

    // 5. Bucle de animación (Game Loop)
    let raf = 0;
    let lastT = performance.now();
    let running = true;
    let lookEmitTimer = 0;

    const animate = (now) => {
      if (!running) return;
      raf = safeRequestAnim(animate);

      const delta = Math.min(statsRef.current.world.maxDeltaSeconds, (now - lastT) / 1000);
      const time = now * 0.001;
      lastT = now;

      // Entrada combinada teclado + táctil (desde los espejos: el closure de
      // este bucle conserva los valores del primer render).
      const virt = virtualInputRef.current;
      const currentInput = {
        forward: inputRef.current.forward || !!virt.forward,
        backward: inputRef.current.backward || !!virt.backward,
        left: inputRef.current.left || !!virt.left,
        right: inputRef.current.right || !!virt.right,
        handbrake: inputRef.current.handbrake || !!virt.handbrake,
        // Salto: flanco de entrada que consume el bucle de física este frame.
        jump: inputRef.current.jump || !!virt.jump,
      };
      inputRef.current.jump = false;
      virt.jump = false; // one-shot táctil: se consume al leerlo

      terrain.update(delta, time);
      instanced.update(time);
      van.update(delta, currentInput, zoneRef.current, time);
      van.updateCamera(camera, delta);
      fauna.update(delta, time);
      npcs.update(time, camera, delta);
      clues.update(time);
      atmosphere.update(delta, time);

      const playerPos = van.getActivePosition();
      const interaction = statsRef.current.interaction;
      const nearAnimal = fauna.getNearestAnimal(playerPos, interaction.animalRadius);
      const nearNpc = npcs.getNearbyNpc(playerPos, interaction.npcRadius);
      const nearClue = clues.getNearbyClue(playerPos, interaction.clueRadius);

      if (nearAnimal) {
        setNearbyTarget({ type: 'animal', data: nearAnimal });
      } else if (nearNpc) {
        setNearbyTarget({ type: 'npc', data: nearNpc });
      } else if (nearClue) {
        setNearbyTarget({ type: 'clue', data: nearClue });
      } else {
        setNearbyTarget(null);
      }

      if (now - lookEmitTimer > statsRef.current.interaction.hudEmitIntervalMs && onLookUpdate) {
        lookEmitTimer = now;
        const activeHeading = van.isFootMode ? van.rangerHeading : van.heading;
        const headingDeg = ((activeHeading * 180) / Math.PI + 360) % 360;
        onLookUpdate({
          headingDeg,
          speedKmh: Math.round((van.isFootMode ? van.rangerSpeed ?? 0 : van.speed) * 3.6),
          x: playerPos.x,
          z: playerPos.z,
          nearAnimal,
          nearNpc,
          nearClue,
          isFootMode: van.isFootMode,
          // Fase activa del cielo para el reloj del HUD.
          phaseId: atmosphereRef.current?.phaseId ?? null,
        });
      }

      if (renderer) {
        try {
          renderer.render(scene, camera);
        } catch (e) {
          /* noop en entornos de test */
        }
      }
    };

    raf = safeRequestAnim(animate);

    return () => {
      running = false;
      safeCancelAnim(raf);
      ro?.disconnect();
      van.dispose();
      renderer?.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------ Cambio dinámico de Zona */
  const loadZone = useCallback((newZoneId) => {
    if (!terrainRef.current) return;

    terrainRef.current.buildZone(newZoneId);
    instancedRef.current.buildForZone(newZoneId);
    atmosphereRef.current.setZoneAtmosphere(newZoneId);

    // Los puntos de aparición se definen en player_stats.json → world.spawnPoints
    const worldCfg = statsRef.current.world;
    const spawn = worldCfg.spawnPoints?.[newZoneId] ?? worldCfg.defaultSpawn ?? { x: -15, z: -70, heading: 0 };

    vanRef.current.setPosition(spawn.x, spawn.z, spawn.heading ?? 0, newZoneId);

    faunaRef.current.buildForZone(newZoneId, cases, doneCases);
    npcsRef.current.buildForZone(newZoneId);
    cluesRef.current.buildForZone(newZoneId);
  }, [cases, doneCases]);

  useEffect(() => {
    loadZone(zoneId);
  }, [zoneId, loadZone]);

  useEffect(() => {
    const van = vanRef.current;
    if (!van) return;

    van.cameraMode = cameraMode;
    // Botones táctiles y accesibles modifican el estado React. Convertimos ese
    // deseo en una transición física real, en vez de escribir directamente
    // `isFootMode`: dismount() calcula la puerta junto a la furgoneta actual.
    if (Boolean(isFootMode) !== van.isFootMode) {
      if (isFootMode) van.dismount();
      else van.mount();
    }
    van.sirenActive = sirenActive;
    van.headlightsActive = headlightsActive;
    van.headlights.forEach((h) => { h.visible = headlightsActive; });
  }, [cameraMode, isFootMode, sirenActive, headlightsActive]);

  /* ------------------------------- Ciclo día/noche (sincronía React ↔ escena) */
  // Auto-avance del ciclo.
  useEffect(() => {
    atmosphereRef.current?.setCycleEnabled(Boolean(cycleAuto));
  }, [cycleAuto]);

  // Fase manual: el usuario (tecla T o HUD) fija la hora; desactiva el auto.
  // Si la escena ya está en esa fase (la tecla T la aplicó al instante), no se
  // reinicia la transición.
  useEffect(() => {
    const atmosphere = atmosphereRef.current;
    if (!atmosphere || !timePhase) return;
    if (atmosphere.phaseId === timePhase) return;
    if (atmosphere.cycleEnabled) {
      atmosphere.setCycleEnabled(false);
      onToggleCycleAuto?.(false);
    }
    atmosphere.setPhase(timePhase, 2);
  }, [timePhase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------- Entrada desacoplada (InputManager) */
  useEffect(() => {
    // Envoltorios seguros: en entornos sin navegador (jsdom, SSR) no existe rAF.
    const reqFrame = (fn) => (typeof window !== 'undefined' && window.requestAnimationFrame
      ? window.requestAnimationFrame(fn)
      : setTimeout(fn, 16));
    const cancelFrame = (id) => (typeof window !== 'undefined' && window.cancelAnimationFrame
      ? window.cancelAnimationFrame(id)
      : clearTimeout(id));

    let disposed = false;
    let manager = null;
    let raf = 0;

    (async () => {
      // Carga asíncrona de los parámetros de jugabilidad (no bloquea el render)
      try {
        const stats = await loadConfig('player_stats.json', DEFAULT_PLAYER_STATS);
        if (!disposed) {
          statsRef.current = stats;
          // Ritmo del ciclo día/noche desde player_stats.json → world.dayCycle.
          const cycle = stats.world?.dayCycle;
          if (cycle && atmosphereRef.current) {
            atmosphereRef.current.cycleSecondsPerPhase = cycle.secondsPerPhase ?? 45;
          }
        }
      } catch (e) { /* respaldo empaquetado */ }

      manager = await InputManager.create({ fallback: DEFAULT_KEYBINDINGS });
      if (disposed) { manager.dispose(); return; }
      manager.loadUserOverrides();
      inputManagerRef.current = manager;

      // Sondeo por frame: acciones sostenidas → estado de conducción,
      // acciones puntuales → callbacks del juego.
      const poll = () => {
        if (disposed) return;
        raf = reqFrame(poll);
        manager.beginFrame();

        for (const [action, key] of Object.entries(ACTION_TO_DRIVE_INPUT)) {
          inputRef.current[key] = manager.isDown(action);
        }
        if (manager.wasPressed('INTERACT')) triggerContextInteractionRef.current();
        if (manager.wasPressed('HONK')) vanRef.current?.honk();
        // El salto es un flanco de entrada que consume la física del guardián.
        if (manager.wasPressed('JUMP')) inputRef.current.jump = true;

        // Sirena, faros, cámara, entrar/salir del vehículo y ciclo horario son
        // propiedad del estado de React: se notifican hacia arriba en vez de
        // mutar la escena directamente.
        for (const action of ['TOGGLE_SIREN', 'TOGGLE_HEADLIGHTS', 'CYCLE_CAMERA', 'TOGGLE_FOOT_MODE', 'CYCLE_TIME', 'TOGGLE_CYCLE']) {
          if (manager.wasPressed(action)) actionHandlersRef.current[action]?.();
        }

        manager.endFrame();
      };
      raf = reqFrame(poll);
    })();

    return () => {
      disposed = true;
      cancelFrame(raf);
      manager?.dispose();
      inputManagerRef.current = null;
    };
  }, []);

  const triggerContextInteraction = () => {
    if (!nearbyTarget) return;
    if (nearbyTarget.type === 'animal' && onInteractAnimal) {
      onInteractAnimal(nearbyTarget.data.caseId, nearbyTarget.data.species);
    } else if (nearbyTarget.type === 'npc' && onTalkNPC) {
      onTalkNPC(nearbyTarget.data);
    } else if (nearbyTarget.type === 'clue' && onInspectClue) {
      onInspectClue(nearbyTarget.data);
    }
  };

  triggerContextInteractionRef.current = triggerContextInteraction;

  return (
    <div className="gandia-3d-wrapper" ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {nearbyTarget && (
        <div className="interaction-prompt">
          <button
            type="button"
            className={`interaction-btn interaction-btn--${nearbyTarget.type}`}
            onClick={triggerContextInteraction}
          >
            <span className="interaction-btn__key">E</span>
            <span className="interaction-btn__label">
              {nearbyTarget.type === 'animal' && `Atender aviso: ${nearbyTarget.data.species}`}
              {nearbyTarget.type === 'npc' && `Hablar con ${nearbyTarget.data.name}`}
              {nearbyTarget.type === 'clue' && `Investigar ${nearbyTarget.data.title}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
