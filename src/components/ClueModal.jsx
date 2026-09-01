import React from 'react';
import { Search, Check, X, Zap, Footprints, Info } from 'lucide-react';

/**
 * Modal de inspección de pistas medioambientales encontradas en 3D.
 */

export default function ClueModal({ clueData, onClose }) {
  return (
    <div className="modal-layer modal-layer--clue" onMouseDown={onClose}>
      <div className="clue-box glass-panel" onMouseDown={(e) => e.stopPropagation()}>
        <header className="clue-box__header">
          <div className="clue-badge">
            <span className="clue-emoji">{clueData.icon || '🔍'}</span>
            <div>
              <span className="clue-kicker">PISTA MEDIOAMBIENTAL DESCUBIERTA</span>
              <h3>{clueData.title}</h3>
            </div>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <div className="clue-box__body">
          <div className="clue-desc">
            <p>{clueData.desc}</p>
          </div>

          <div className="clue-bonus-row">
            <span className="clue-bonus-chip">
              <Zap size={14} /> +15 XP de rastreo de fauna
            </span>
            <span className="clue-hint-chip">
              <Info size={14} /> El aviso en el radar se actualiza con precisión
            </span>
          </div>
        </div>

        <footer className="clue-box__footer">
          <button className="modal-primary" onClick={onClose}>
            <Check size={16} /> Entendido
          </button>
        </footer>
      </div>
    </div>
  );
}
