import React, { useState } from 'react';
import { Camera, X, Check, Sliders, Sun, Eye, Grid, Zap } from 'lucide-react';

/**
 * Modo Cámara de Guardián 3D ("Photo Mode").
 * Permite tomar instantáneas en alta resolución del entorno 3D,
 * la fauna y los paisajes de Gandía, guardándolas en el álbum de la zona.
 */

export default function PhotoMode3D({ onCapture, onClose, zoneName, onSavePhoto, notify, t }) {
  const [showGrid, setShowGrid] = useState(true);
  const [filter, setFilter] = useState('normal'); // 'normal' | 'wildlife' | 'thermal' | 'coast'
  const [flash, setFlash] = useState(false);

  const takeSnapshot = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    if (onCapture) {
      const dataUrl = onCapture();
      if (dataUrl) {
        onSavePhoto(dataUrl);
      }
    }
  };

  return (
    <div className={`photo-mode-overlay filter-${filter}`}>
      {/* Flash blanco al disparar */}
      {flash && <div className="photo-flash" />}

      {/* Visor de cámara con marco y retícula */}
      <div className="photo-viewfinder">
        <div className="viewfinder-corner top-left" />
        <div className="viewfinder-corner top-right" />
        <div className="viewfinder-corner bottom-left" />
        <div className="viewfinder-corner bottom-right" />

        {showGrid && (
          <div className="viewfinder-grid">
            <span className="grid-h1" />
            <span className="grid-h2" />
            <span className="grid-v1" />
            <span className="grid-v2" />
          </div>
        )}

        <div className="viewfinder-center-cross">
          <span />
        </div>
      </div>

      {/* HUD superior */}
      <header className="photo-hud-top">
        <div className="photo-meta">
          <span className="photo-rec-dot" />
          <strong>CÁMARA DE GUARDIÁN · 3D</strong>
          <small>{zoneName.toUpperCase()} · GANDÍA NATURA</small>
        </div>
        <button className="photo-close-btn" onClick={onClose} aria-label="Salir de modo foto">
          <X size={20} />
        </button>
      </header>

      {/* Controles laterales y filtros */}
      <div className="photo-filters-bar">
        {[
          { id: 'normal', label: 'Natural' },
          { id: 'wildlife', label: 'Fauna Cálida' },
          { id: 'thermal', label: 'Visión Nocturna' },
          { id: 'coast', label: 'Marjal Esmeralda' },
        ].map((f) => (
          <button
            key={f.id}
            className={`photo-filter-btn ${filter === f.id ? 'is-active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}

        <button
          className={`photo-filter-btn ${showGrid ? 'is-active' : ''}`}
          onClick={() => setShowGrid(!showGrid)}
          title="Regla de los tercios"
        >
          <Grid size={15} /> Rejilla
        </button>
      </div>

      {/* Botón disparador central */}
      <footer className="photo-hud-bottom">
        <button className="photo-shutter-btn" onClick={takeSnapshot} aria-label="Tomar fotografía">
          <div className="shutter-inner">
            <Camera size={26} />
          </div>
        </button>
      </footer>
    </div>
  );
}
