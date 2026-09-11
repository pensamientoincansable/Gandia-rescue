import React from 'react';
import {
  Zap, Volume2, Sun, Moon, Eye, Navigation, Shield, User, Camera, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Radio, Disc, ChevronsUp,
} from 'lucide-react';

/**
 * Panel de control HUD de la Furgoneta de Rescate 3D.
 * Incluye velocímetro digital, marchas, botones de sirena, faros, claxon,
 * selector de cámaras, reloj del ciclo día/noche y controles táctiles en
 * pantalla para dispositivos móviles.
 */

export default function VanControlsHUD({
  speedKmh = 0,
  sirenActive = false,
  onToggleSiren,
  headlightsActive = true,
  onToggleHeadlights,
  cameraMode = 'chase',
  onChangeCamera,
  isFootMode = false,
  onToggleFootMode,
  onHonk,
  isMobile = false,
  onVirtualInput,
  t,
  phaseId = null,
  onCycleTime,
  cycleAuto = false,
  onToggleCycleAuto,
}) {
  const isReverse = speedKmh < 0;
  const absSpeed = Math.abs(speedKmh);

  const handleTouchStart = (action) => (e) => {
    e.preventDefault();
    onVirtualInput?.({ [action]: true });
  };

  const handleTouchEnd = (action) => (e) => {
    e.preventDefault();
    onVirtualInput?.({ [action]: false });
  };

  // Todos los botones táctiles comparten gestos: pulsar/soltar con dedo o
  // ratón, más cancelación (el dedo se sale del botón, una llamada
  // interrumpe…) para no dejar acciones “enganchadas”, y bloqueo del menú
  // contextual de la pulsación larga en móvil.
  const touchProps = (action, label) => ({
    onTouchStart: handleTouchStart(action),
    onTouchEnd: handleTouchEnd(action),
    onTouchCancel: handleTouchEnd(action),
    onMouseDown: handleTouchStart(action),
    onMouseUp: handleTouchEnd(action),
    onMouseLeave: handleTouchEnd(action),
    onContextMenu: (e) => e.preventDefault(),
    'aria-label': label,
  });

  return (
    <div className="van-hud-container">
      {/* Indicador de instrumentación digital (velocímetro + marchas) */}
      <div className="van-dashboard glass-panel">
        <div className="van-speed-gauge">
          <span className="van-speed-val">{absSpeed}</span>
          <small className="van-speed-unit">KM/H</small>
        </div>

        <div className="van-gear-indicator">
          <span className={`gear-chip ${absSpeed === 0 ? 'is-active' : ''}`}>P</span>
          <span className={`gear-chip ${!isReverse && absSpeed > 0 ? 'is-active' : ''}`}>D</span>
          <span className={`gear-chip ${isReverse ? 'is-active' : ''}`}>R</span>
        </div>

        <div className="van-status-row">
          <span className={`van-chip ${sirenActive ? 'is-siren-on' : ''}`}>
            <Radio size={12} /> {sirenActive ? 'SIRENA ACTIVA' : 'PATRULLA'}
          </span>
          <span className={`van-chip ${isFootMode ? 'is-foot' : 'is-drive'}`}>
            {isFootMode ? <User size={12} /> : <Navigation size={12} />}
            {isFootMode ? 'A PIE' : 'FURGONETA'}
          </span>
        </div>
      </div>

      {/* Barra de funciones del vehículo */}
      <div className="van-actions-toolbar glass-panel">
        <button
          type="button"
          className={`van-tool-btn ${sirenActive ? 'is-active is-siren' : ''}`}
          onClick={onToggleSiren}
          title="Alternar sirena de emergencia [B]"
        >
          <Radio size={17} />
          <span>Sirena</span>
        </button>

        <button
          type="button"
          className={`van-tool-btn ${headlightsActive ? 'is-active' : ''}`}
          onClick={onToggleHeadlights}
          title="Faros de largo alcance [L]"
        >
          <Sun size={17} />
          <span>Faros</span>
        </button>

        <button
          type="button"
          className="van-tool-btn"
          onClick={onHonk}
          title="Claxon [H]"
        >
          <Volume2 size={17} />
          <span>Claxon</span>
        </button>

        <button
          type="button"
          className="van-tool-btn"
          onClick={onChangeCamera}
          title="Cambiar perspectiva de cámara [V]"
        >
          <Eye size={17} />
          <span>{cameraMode === 'chase' ? '3ª Persona' : cameraMode === 'hood' ? 'Cabina' : 'Cenital'}</span>
        </button>

        <button
          type="button"
          className={`van-tool-btn ${isFootMode ? 'is-active' : ''}`}
          onClick={onToggleFootMode}
          title="Entrar/Salir de la furgoneta [F]"
        >
          {isFootMode ? <Navigation size={17} /> : <User size={17} />}
          <span>{isFootMode ? 'Subir a Van' : 'Bajar a Pie'}</span>
        </button>

        <button
          type="button"
          className={`van-tool-btn van-tool-btn--time ${cycleAuto ? 'is-active' : ''}`}
          onClick={onCycleTime}
          title="Avanzar la hora del día [T] · ciclo automático [Y]"
        >
          {phaseId === 'noche' || phaseId === 'madrugada' ? <Moon size={17} /> : <Sun size={17} />}
          <span>
            {phaseId ? (t?.(`phase_${phaseId}`) ?? phaseId) : (t?.('timeClock') ?? 'Hora')}
            {cycleAuto ? ' ▸' : ''}
          </span>
        </button>
      </div>

      {/* Controles táctiles virtuales en pantalla (especial para móvil y táctil) */}
      <div className="van-touch-controls">
        {/* Cruceta o volante virtual izquierdo */}
        <div className="touch-dpad-left">
          <button
            type="button"
            className="touch-btn touch-btn--steer"
            {...touchProps('left', 'Girar izquierda')}
          >
            <ArrowLeft size={22} />
          </button>
          <button
            type="button"
            className="touch-btn touch-btn--steer"
            {...touchProps('right', 'Girar derecha')}
          >
            <ArrowRight size={22} />
          </button>
        </div>

        {/* Pedales de aceleración y freno derechos */}
        <div className="touch-pedals-right">
          {isFootMode && (
            <button
              type="button"
              className="touch-btn touch-btn--jump"
              {...touchProps('jump', 'Saltar')}
            >
              <ChevronsUp size={22} />
              <small>Salto</small>
            </button>
          )}

          <button
            type="button"
            className="touch-btn touch-btn--brake"
            {...touchProps('backward', 'Frenar / Marcha atrás')}
          >
            <ArrowDown size={22} />
            <small>Freno</small>
          </button>

          <button
            type="button"
            className="touch-btn touch-btn--gas"
            {...touchProps('forward', 'Acelerar')}
          >
            <ArrowUp size={24} />
            <small>Gas</small>
          </button>
        </div>
      </div>
    </div>
  );
}
