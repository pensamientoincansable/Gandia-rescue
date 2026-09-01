import React from 'react';
import {
  Zap, Volume2, Sun, Eye, Navigation, Shield, User, Camera, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Radio, Disc,
} from 'lucide-react';

/**
 * Panel de control HUD de la Furgoneta de Rescate 3D.
 * Incluye velocímetro digital, marchas, botones de sirena, faros, claxon,
 * selector de cámaras y controles táctiles en pantalla para dispositivos móviles.
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

  return (
    <div className="van-hud-container" pointerEvents="none">
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
      </div>

      {/* Controles táctiles virtuales en pantalla (especial para móvil y táctil) */}
      <div className="van-touch-controls">
        {/* Cruceta o volante virtual izquierdo */}
        <div className="touch-dpad-left">
          <button
            type="button"
            className="touch-btn touch-btn--steer"
            onTouchStart={handleTouchStart('left')}
            onTouchEnd={handleTouchEnd('left')}
            onMouseDown={handleTouchStart('left')}
            onMouseUp={handleTouchEnd('left')}
            aria-label="Girar izquierda"
          >
            <ArrowLeft size={22} />
          </button>
          <button
            type="button"
            className="touch-btn touch-btn--steer"
            onTouchStart={handleTouchStart('right')}
            onTouchEnd={handleTouchEnd('right')}
            onMouseDown={handleTouchStart('right')}
            onMouseUp={handleTouchEnd('right')}
            aria-label="Girar derecha"
          >
            <ArrowRight size={22} />
          </button>
        </div>

        {/* Pedales de aceleración y freno derechos */}
        <div className="touch-pedals-right">
          <button
            type="button"
            className="touch-btn touch-btn--brake"
            onTouchStart={handleTouchStart('backward')}
            onTouchEnd={handleTouchEnd('backward')}
            onMouseDown={handleTouchStart('backward')}
            onMouseUp={handleTouchEnd('backward')}
            aria-label="Frenar / Marcha atrás"
          >
            <ArrowDown size={22} />
            <small>Freno</small>
          </button>

          <button
            type="button"
            className="touch-btn touch-btn--gas"
            onTouchStart={handleTouchStart('forward')}
            onTouchEnd={handleTouchEnd('forward')}
            onMouseDown={handleTouchStart('forward')}
            onMouseUp={handleTouchEnd('forward')}
            aria-label="Acelerar"
          >
            <ArrowUp size={24} />
            <small>Gas</small>
          </button>
        </div>
      </div>
    </div>
  );
}
