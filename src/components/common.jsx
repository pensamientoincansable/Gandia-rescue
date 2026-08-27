import { useRef, useState } from 'react';
import {
  Award, Camera, Check, ChevronRight, Image as ImageIcon, Info,
  Lock, Navigation, PawPrint, ShieldCheck, Trash2, X, Zap,
} from 'lucide-react';
import { CASES, SPECIES, ZONES, ZONE_LINKS, bearingDeg, caseById, caseCoords, distanceM, formatDistance, speciesById, zoneById } from '../lib/game.js';

export function ModalShell({ close, title, icon: Icon, children, wide = false, className = '' }) {
  return (
    <div className="modal-layer" onMouseDown={close}>
      <section className={`app-modal ${wide ? 'app-modal--wide' : ''} ${className}`} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <span><Icon /></span>
          <h2>{title}</h2>
          <button className="close-button" onClick={close} aria-label="Cerrar"><X /></button>
        </header>
        <div className="app-modal__body">{children}</div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barra de XP                                                         */
/* ------------------------------------------------------------------ */
export function XpBar({ level, progress, t, compact = false }) {
  return (
    <div className={`xp-bar ${compact ? 'xp-bar--compact' : ''}`}>
      <span className="xp-bar__level">{t('levelShort')} {level}</span>
      <div className="xp-bar__track"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <span className="xp-bar__num">{Math.round(progress * 100)}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Brújula tipo cinta                                                  */
/* ------------------------------------------------------------------ */
export function CompassBar({ heading = 0, t }) {
  const dirs = (t('compassDir') ?? 'N|NE|E|SE|S|SO|O|NO').split('|');
  const scale = 3.1; // px por grado
  const ticks = [];
  for (let d = 0; d < 360 * 3; d += 15) ticks.push(d);
  const labels = [];
  for (let i = 0; i < 72; i += 1) {
    const degVal = i * 15;
    const local = ((degVal % 360) + 360) % 360;
    if (local % 45 === 0) labels.push({ deg: degVal, text: dirs[local / 45] });
  }
  const offset = -(360 + heading) * scale;
  return (
    <div className="compass-bar">
      <div className="compass-tape" style={{ transform: `translateX(${offset}px)` }}>
        {ticks.map((d) => (
          <i key={d} className={`compass-tick ${d % 45 === 0 ? 'big' : ''}`} style={{ left: `${d * scale}px` }} />
        ))}
        {labels.map(({ deg: d, text }) => (
          <b key={d} style={{ left: `${d * scale}px` }}>{text}</b>
        ))}
      </div>
      <span className="compass-value">{Math.round((heading % 360 + 360) % 360)}°</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Radar de avisos (modo rescate con GPS)                              */
/* ------------------------------------------------------------------ */
export function Radar({ t, gps, heading, doneCases, selectedCaseId, onSelect, completedColor = '#63b7ab' }) {
  const size = 176;
  const c = size / 2;
  const rMax = 78;
  const MAX_RANGE = 600; // metros representados
  const dots = CASES.map((cse) => {
    const target = caseCoords(cse);
    const dist = gps ? distanceM(gps, target) : null;
    const brg = gps ? bearingDeg(gps, target) : (cse.off[0] * 1e5 + cse.off[1] * 1e5 + 360) % 360;
    const rel = ((brg - heading) % 360 + 360) % 360;
    const rr = dist == null ? 0.6 : Math.min(1, dist / MAX_RANGE);
    const x = c + Math.sin((rel * Math.PI) / 180) * rr * rMax;
    const y = c - Math.cos((rel * Math.PI) / 180) * rr * rMax;
    return { ...cse, x, y, dist, done: (doneCases[cse.id] ?? 0) > 0 };
  });
  return (
    <div className="radar">
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={rMax} className="radar-ring" />
        <circle cx={c} cy={c} r={rMax * 0.66} className="radar-ring" />
        <circle cx={c} cy={c} r={rMax * 0.33} className="radar-ring" />
        <line x1={c} y1={c - rMax} x2={c} y2={c + rMax} className="radar-axis" />
        <line x1={c - rMax} y1={c} x2={c + rMax} y2={c} className="radar-axis" />
        <text x={c} y={11} className="radar-north">N</text>
        <g className="radar-sweep"><path d={`M${c} ${c} L${c - rMax} ${c - 26} A ${rMax} ${rMax} 0 0 1 ${c + 26} ${c - rMax * 0.93} Z`} /></g>
        {/* Haz de visión del jugador estilo Street View / radar Google */}
        <g className="radar-fov">
          <path d={`M${c} ${c} L${c - 38} ${c - rMax * 0.9} A ${rMax * 0.9} ${rMax * 0.9} 0 0 1 ${c + 38} ${c - rMax * 0.9} Z`} className="radar-fov__cone" />
        </g>
        {dots.map((d) => (
          <g key={d.id} className={`radar-dot ${d.done ? 'is-done' : ''} ${selectedCaseId === d.id ? 'is-selected' : ''}`} onClick={() => onSelect(d.id)}>
            <circle cx={d.x} cy={d.y} r="7" className="radar-dot__halo" />
            <circle cx={d.x} cy={d.y} r="3.4" className="radar-dot__core" />
            <title>{d.id}</title>
          </g>
        ))}
        <g className="radar-player">
          <circle cx={c} cy={c} r="4" />
          <path d={`M${c} ${c - 10} l4.5 9 -4.5 -2.4 -4.5 2.4 Z`} />
        </g>
      </svg>
      <div className="radar-legend"><span><i className="dot dot--todo" />{t('nearby')}</span><span><i className="dot dot--done" />{t('completed')}</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fotos de una zona (añadir desde archivo o cámara)                   */
/* ------------------------------------------------------------------ */
export function ZonePhotos({ t, zoneId, photos, onAddFiles, onRemove, bonusNote = null }) {
  const inputRef = useRef(null);
  const list = photos ?? [];
  return (
    <div className="zone-photos">
      <div className="zone-photos__head">
        <strong><ImageIcon size={14} />{t('photosTitle')}</strong>
        <button className="zone-photos__add" onClick={() => inputRef.current?.click()}>
          <Camera size={14} />{t('addPhoto')}
        </button>
      </div>
      {bonusNote && <small className="zone-photos__bonus"><Zap size={11} />{bonusNote}</small>}
      {list.length === 0
        ? <p className="zone-photos__empty">{t('shelterEmpty') === '' ? '' : t('addPhoto')} · 📷</p>
        : <div className="zone-photos__grid">
          {list.map((p) => (
            <figure key={p.id}>
              <img src={p.src} alt={`${t('photosTitle')} ${zoneId}`} loading="lazy" />
              <button onClick={() => onRemove(p.id)} aria-label={t('removePhoto')}><Trash2 size={13} /></button>
            </figure>
          ))}
        </div>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onAddFiles(files);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hoja de protocolo de cuidados                                       */
/* ------------------------------------------------------------------ */
export function CareSheet({ t, caseData, mode, onAction, onClose }) {
  const species = speciesById(caseData.species);
  const bestLabel = { hydrate: t('hydrate'), treat: t('treat'), observe: t('observe') };
  return (
    <div className="modal-layer modal-layer--game" onMouseDown={onClose}>
      <div className="care-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose} aria-label={t('close')}><X /></button>
        <span className="modal-kicker"><ShieldCheck size={16} />{t('approach')}</span>
        <h2>{species?.emoji} {t(`${caseData.id}T`)}</h2>
        <p>{t('chooseAction')}</p>
        <div className="condition-card">
          <span className="condition-icon"><Info /></span>
          <div>
            <strong>{t(`${caseData.id}C`)}</strong>
            <small>{t(`${caseData.id}Tip`)}</small>
          </div>
        </div>
        <div className="care-actions">
          {['hydrate', 'treat', 'observe'].map((action) => (
            <button key={action} onClick={() => onAction(action)}>
              {action === 'hydrate' && <span><WavesIcon /></span>}
              {action === 'treat' && <span><HeartIcon /></span>}
              {action === 'observe' && <span><BinocularsIcon /></span>}
              <strong>{t(action)}{caseData.best === action ? ` · ${t('best')}` : ''}</strong>
              <small>{action === 'hydrate' ? t('unitWater') : action === 'treat' ? t('unitCare') : t('unitObserve')}</small>
            </button>
          ))}
        </div>
        {mode === 'explore' && <p className="care-sheet__noxp"><Zap size={13} />{t('noXp')}</p>}
      </div>
    </div>
  );
}

/* Iconos inline pequeños para no inflar el bundle de lucide */
function WavesIcon() { return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 12c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 4-2 5 0" /><path d="M2 17c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 4-2 5 0" /><path d="M7 19.5c1-2 3.5-2.5 5-1.5" /></svg>; }
function HeartIcon() { return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20.5S3.5 15 3.5 8.9C3.5 5.9 5.9 4 8.4 4c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2 2.5 0 4.9 1.9 4.9 4.9C20.5 15 12 20.5 12 20.5Z" /><path d="M8 10.5h2l1.2-2 1.6 4 1.2-2h2" /></svg>; }
function BinocularsIcon() { return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="6.5" cy="16.5" r="3.5" /><circle cx="17.5" cy="16.5" r="3.5" /><path d="M9 9.5 10 4h4l1 5.5M9.8 13.8 10 4M14.2 13.8 14 4M10 13.5h4" /></svg>; }

/* ------------------------------------------------------------------ */
/* Aviso de éxito de rescate                                           */
/* ------------------------------------------------------------------ */
export function SuccessToast({ t, xp, flags, newSpecies, onClose, onViewCard, isLevelUp, onShelter }) {
  const species = newSpecies ? speciesById(newSpecies) : null;
  return (
    <div className="success-toast">
      <span className="success-icon"><Check /></span>
      <div>
        <strong>{t('success')}</strong>
        <p>{t('successText')}</p>
        {xp > 0 && (
          <span className="success-xp">
            <Zap size={12} />+{xp} {t('xp')}
            {flags?.includes('proximityBonus') ? ` · ${t('proximityBonus')}` : ''}
            {flags?.includes('correctAction') ? ` · ${t('correctAction')}` : ''}
          </span>
        )}
        {xp === 0 && <span className="success-xp success-xp--none">{t('noXp')}</span>}
        {species && <span className="success-species"><PawPrint size={12} />{t('newCard')}: {species.emoji} {t(`sp_${species.id}`)}</span>}
        <div className="success-toast__actions">
          {species && <button onClick={onViewCard}>{t('viewCard')}<ChevronRight size={15} /></button>}
          {isLevelUp && <button onClick={onShelter}><Award size={14} />{t('goToShelter')}</button>}
        </div>
      </div>
      <button className="success-toast__close" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aviso de subida de nivel                                            */
/* ------------------------------------------------------------------ */
export function LevelUpToast({ t, level, unlocked, onClose, onShelter }) {
  const names = [...(unlocked?.items ?? []).map((id) => t(`it_${id}`)), ...(unlocked?.grounds ?? []).map((id) => t(`ground${id[0].toUpperCase()}${id.slice(1)}`))];
  return (
    <div className="levelup-toast">
      <span className="levelup-badge">★</span>
      <div>
        <strong>{t('levelUp')} {t('levelShort')}{level}</strong>
        {names.length > 0 && (
          <p>
            {t('levelUnlocked')}:
            {names.slice(0, 4).map((n) => <b key={n}> {n}</b>)}
            {names.length > 4 ? ` +${names.length - 4}` : ''}
          </p>
        )}
        <div className="levelup-toast__actions">
          <button onClick={onShelter}><Award size={14} />{t('goToShelter')}</button>
          <button onClick={onClose}>{t('continueLabel')}</button>
        </div>
      </div>
      <button className="success-toast__close" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mapa virtual: grafo de zonas (modo exploración)                     */
/* ------------------------------------------------------------------ */
const MAP_LAYOUT = {
  montduver: { x: 70, y: 268 },
  casc: { x: 186, y: 226 },
  riu: { x: 250, y: 158 },
  marjal: { x: 138, y: 92 },
  platja: { x: 268, y: 62 },
  port: { x: 336, y: 118 },
};

export function TravelMap({ t, currentZone, onTravel, doneCases, gpsPosition, heading = null }) {
  const links = [];
  const seen = new Set();
  for (const [from, list] of Object.entries(ZONE_LINKS)) {
    for (const { to } of list) {
      const key = [from, to].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      links.push([from, to]);
    }
  }
  return (
    <div className="travel-map">
      <p className="travel-map__hint"><Navigation size={13} />{t('travelHint')}</p>
      <svg viewBox="0 0 400 320" className="travel-map__svg">
        <defs>
          <radialGradient id="tmGlow" cx="50%" cy="42%" r="65%">
            <stop stopColor="rgba(99,183,171,.16)" />
            <stop offset="1" stopColor="rgba(4,10,8,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="400" height="320" fill="url(#tmGlow)" />
        <path d="M20 300 C80 250 60 190 120 170 S230 150 260 96 S330 60 380 30" className="travel-map__coast" />
        {links.map(([a, b]) => {
          const A = MAP_LAYOUT[a];
          const B = MAP_LAYOUT[b];
          const active = a === currentZone || b === currentZone;
          return <line key={`${a}-${b}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={`travel-map__link ${active ? 'is-active' : ''}`} />;
        })}
        {heading != null && (() => {
          const pos = MAP_LAYOUT[currentZone];
          if (!pos) return null;
          const radAngle = ((heading - 90) * Math.PI) / 180;
          const fovLen = 34;
          const fovSpread = 0.5;
          const x1 = pos.x + Math.cos(radAngle - fovSpread) * fovLen;
          const y1 = pos.y + Math.sin(radAngle - fovSpread) * fovLen;
          const x2 = pos.x + Math.cos(radAngle + fovSpread) * fovLen;
          const y2 = pos.y + Math.sin(radAngle + fovSpread) * fovLen;
          return (
            <g className="travel-map__fov" pointerEvents="none">
              <path d={`M${pos.x} ${pos.y} L${x1} ${y1} A ${fovLen} ${fovLen} 0 0 1 ${x2} ${y2} Z`} className="travel-map__fov-cone" />
              <line x1={pos.x} y1={pos.y} x2={pos.x + Math.cos(radAngle) * (fovLen + 4)} y2={pos.y + Math.sin(radAngle) * (fovLen + 4)} className="travel-map__fov-needle" />
            </g>
          );
        })()}
        {ZONES.map((z) => {
          const pos = MAP_LAYOUT[z.id];
          const isCurrent = z.id === currentZone;
          const zoneCases = CASES.filter((c) => c.zone === z.id);
          const allDone = zoneCases.length > 0 && zoneCases.every((c) => (doneCases[c.id] ?? 0) > 0);
          return (
            <g key={z.id} className={`travel-map__node ${isCurrent ? 'is-current' : ''}`} onClick={() => onTravel(z.id)}>
              <circle cx={pos.x} cy={pos.y} r="17" className="travel-map__halo" />
              <circle cx={pos.x} cy={pos.y} r={isCurrent ? "10" : "8"} className={`travel-map__dot ${allDone ? 'is-done' : ''}`} />
              {zoneCases.some((c) => (doneCases[c.id] ?? 0) === 0) && <circle cx={pos.x + 9} cy={pos.y - 9} r="3.4" className="travel-map__alert" />}
              <text x={pos.x} y={pos.y + 32}>{t(`z${z.id[0].toUpperCase()}${z.id.slice(1)}`)}</text>
            </g>
          );
        })}
        {gpsPosition && (() => {
          // posición GPS aproximada respecto a la caja envolvente de las zonas
          const lats = ZONES.map((z) => z.lat);
          const lngs = ZONES.map((z) => z.lng);
          const x = 40 + 320 * ((gpsPosition.lng - Math.min(...lngs)) / Math.max(1e-6, Math.max(...lngs) - Math.min(...lngs)));
          const y = 290 - 260 * ((gpsPosition.lat - Math.min(...lats)) / Math.max(1e-6, Math.max(...lats) - Math.min(...lats)));
          if (x < 0 || x > 400 || y < 0 || y > 320) return null;
          return (
            <g className="travel-map__gps"><circle cx={x} cy={y} r="6" /><circle cx={x} cy={y} r="2.4" /><text x={x + 10} y={y + 4}>GPS</text></g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Galería de especies                                                 */
/* ------------------------------------------------------------------ */
export function SpeciesGallery({ t, unlockedSpecies }) {
  return (
    <>
      <p className="modal-intro">{t('learnDesc')}</p>
      <div className="species-grid">
        {SPECIES.map((s) => {
          const unlocked = unlockedSpecies.includes(s.id);
          return (
            <article key={s.id} className={`species-card ${unlocked ? '' : 'species-card--locked'}`}>
              <div className="species-art">{unlocked ? <span className="species-emoji">{s.emoji}</span> : <Lock size={22} />}</div>
              <div className="species-copy">
                <h3>{t(`sp_${s.id}`)}</h3>
                <em>{s.latin}</em>
                <p>{s.tags.map((tag) => <span key={tag}>{t(tag)}</span>)}</p>
                {!unlocked && <small className="species-lock-hint"><Lock size={11} />{t('lockedCard')}</small>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="species-foot"><PawPrint size={15} /><span>Información educativa basada en fauna de la Comunitat Valenciana.</span></div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Aviso genérico (toast)                                              */
/* ------------------------------------------------------------------ */
export function Toast({ text, tone = 'ok', onClose }) {
  return (
    <div className={`generic-toast generic-toast--${tone}`} onClick={onClose}>
      {tone === 'ok' ? <Check size={16} /> : <Info size={16} />}
      <span>{text}</span>
    </div>
  );
}
