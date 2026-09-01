import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft, Bell, ChevronDown, ExternalLink, FileWarning, HeartPulse, Info,
  MapPin, Navigation, PawPrint, Radio, UtensilsCrossed, Zap, Eye, Sun, Volume2, Camera,
} from 'lucide-react';
import GandiaWorld3D from '../three/GandiaWorld3D.jsx';
import Panorama360 from '../components/Panorama360.jsx';
import DialogueModal from '../components/DialogueModal.jsx';
import ClueModal from '../components/ClueModal.jsx';
import PhotoMode3D from '../components/PhotoMode3D.jsx';
import VanControlsHUD from '../components/VanControlsHUD.jsx';
import {
  CareSheet, CompassBar, LevelUpToast, Radar, SuccessToast, Toast, XpBar, ZonePhotos,
} from '../components/common.jsx';
import {
  CASES, bearingDeg, caseById, caseCoords, distanceM, fileToDataUrl, formatDistance, levelForXp, levelProgress,
  rescueXp, speciesById, useGeolocation, zoneById, ZONE_LINKS, ZONES,
} from '../lib/game.js';

/**
 * Modo Rescate 3D: Desplazamiento por GPS y simulación de patrulla de emergencia.
 * Conduce la furgoneta de rescate hasta el aviso indicado en el radar 3D,
 * utiliza el equipamiento y aplica el protocolo de socorro para ganar XP.
 */
export default function RescueMode({
  t, goMenu, isMobile, save, actions, onOpenSpecies, onOpenShelter, sensitivity, notify,
}) {
  const geo = useGeolocation(true);
  const hasGps = !!geo.position;

  const [gpsZone, setGpsZone] = useState(null);
  const [manualZone, setManualZone] = useState('platja');
  const [selectedCaseId, setSelectedCaseId] = useState('cJabali');
  const [careCaseId, setCareCaseId] = useState(null);
  const [activeDialogueNpc, setActiveDialogueNpc] = useState(null);
  const [activeClue, setActiveClue] = useState(null);
  const [photoModeActive, setPhotoModeActive] = useState(false);
  const [success, setSuccess] = useState(null);
  const [levelUp, setLevelUp] = useState(null);
  const [showMissions, setShowMissions] = useState(!isMobile);
  const [noGpsDismissed, setNoGpsDismissed] = useState(false);

  // Estados de la Furgoneta de Rescate
  const [speedKmh, setSpeedKmh] = useState(0);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [sirenActive, setSirenActive] = useState(true); // Sirena activa por defecto en modo rescate
  const [headlightsActive, setHeadlightsActive] = useState(true);
  const [cameraMode, setCameraMode] = useState('chase');
  const [isFootMode, setIsFootMode] = useState(false);
  const [virtualInput, setVirtualInput] = useState({});

  const captureFnRef = useRef(null);
  const honkRef = useRef(null);

  const zone = zoneById(hasGps && gpsZone ? gpsZone : manualZone);
  const zoneName = t(`z${zone.id[0].toUpperCase()}${zone.id.slice(1)}`);

  /* Zona más cercana según GPS real */
  useEffect(() => {
    if (!geo.position) return;
    let best = null;
    let bestDist = Infinity;
    for (const z of ZONES) {
      const d = distanceM(geo.position, z);
      if (d < bestDist) { bestDist = d; best = z.id; }
    }
    setGpsZone(best);
  }, [geo.position]);

  useEffect(() => { actions.visitZone(zone.id); }, [zone.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Selecciona automáticamente un aviso de la zona actual */
  useEffect(() => {
    const zoneCases = CASES.filter((c) => c.zone === zone.id);
    if (!zoneCases.some((c) => c.id === selectedCaseId)) {
      const pending = zoneCases.find((c) => (save.cases[c.id] ?? 0) === 0) ?? zoneCases[0];
      if (pending) setSelectedCaseId(pending.id);
    }
  }, [zone.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCase = caseById(selectedCaseId) ?? CASES[0];
  const caseDistance = useMemo(
    () => (geo.position ? distanceM(geo.position, caseCoords(selectedCase)) : null),
    [geo.position, selectedCase],
  );

  /* Hotspots compatibles */
  const hotspots = useMemo(() => {
    const spots = [];
    if (hasGps && selectedCase) {
      const bearing = bearingDeg(geo.position, caseCoords(selectedCase));
      const yaw = ((bearing - zone.north + 540) % 360) - 180;
      spots.push({
        id: `case-${selectedCase.id}`,
        kind: 'marker',
        yaw,
        pitch: -8,
        label: t(`${selectedCase.id}T`),
        node: (
          <span className="pano-marker">
            <i><PawPrint size={15} /></i>
            <b>{t(`${selectedCase.id}T`)}</b>
            <small>{caseDistance != null ? formatDistance(caseDistance) : ''}</small>
          </span>
        ),
        onClick: () => setCareCaseId(selectedCase.id),
      });
    }
    if (!hasGps) {
      for (const link of ZONE_LINKS[zone.id] ?? []) {
        const target = zoneById(link.to);
        spots.push({
          id: `link-${link.to}`,
          kind: 'arrow',
          yaw: link.yaw,
          pitch: -12,
          label: t(`z${link.to[0].toUpperCase()}${link.to.slice(1)}`),
          node: (
            <span className="pano-arrow">
              <i><Navigation size={16} /></i>
              <b>{t(`z${link.to[0].toUpperCase()}${link.to.slice(1)}`)}</b>
            </span>
          ),
          onClick: () => { setManualZone(target.id); },
        });
      }
    }
    return spots;
  }, [hasGps, geo.position, zone.id, selectedCase, caseDistance, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLookUpdate = useCallback(({ headingDeg: hDeg, speedKmh: spd, isFootMode: foot }) => {
    setHeadingDeg(hDeg);
    setSpeedKmh(spd);
    setIsFootMode(foot);
  }, []);

  const handleInteractAnimal = (caseId, speciesId) => {
    setCareCaseId(caseId);
  };

  const handleTalkNPC = (npcData) => {
    setActiveDialogueNpc(npcData);
  };

  const handleInspectClue = (clueData) => {
    setActiveClue(clueData);
    actions.awardXp(15);
    notify(`🔍 Pista de rastreo: ${clueData.title} (+15 XP)`);
  };

  const onAction = (action) => {
    const cse = caseById(careCaseId);
    if (!cse) return;
    const { xp, flags } = rescueXp({
      action,
      best: cse.best,
      distanceMeters: caseDistance,
      hasGps,
      alreadyDone: (save.cases[cse.id] ?? 0) > 0,
    });
    const result = actions.completeRescue(cse.id, { xp });
    setCareCaseId(null);
    setSuccess({ xp, flags, newSpecies: result?.newSpecies ?? null });
    if (result && result.levelAfter > result.levelBefore) setLevelUp({ level: result.levelAfter, unlocked: result.unlocked });
  };

  const onAddPhotos = async (files) => {
    let added = 0;
    let full = false;
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        if (actions.addPhoto(zone.id, dataUrl)) added += 1;
        else { full = true; break; }
      } catch {
        notify(t('photoFail'), 'warn');
      }
    }
    if (full) notify(t('photoLimit'), 'warn');
    if (added > 0) {
      notify(t('photoAdded'));
      if (!save.photoXpZones.includes(zone.id)) {
        actions.markPhotoXp(zone.id);
        actions.awardXp(15);
      }
    }
  };

  const handleSave3DPhoto = (dataUrl) => {
    if (actions.addPhoto(zone.id, dataUrl)) {
      notify('📸 Fotografía de rescate guardada en el álbum');
      if (!save.photoXpZones.includes(zone.id)) {
        actions.markPhotoXp(zone.id);
        actions.awardXp(15);
        notify('⭐ +15 XP · Primera foto de la zona');
      }
    } else {
      notify(t('photoLimit'), 'warn');
    }
  };

  const toggleCameraMode = () => {
    setCameraMode((prev) => (prev === 'chase' ? 'hood' : prev === 'hood' ? 'top' : 'chase'));
  };

  const level = levelForXp(save.xp);

  return (
    <main className="game-screen rescue-game screen-enter">
      {/* 1. MUNDO 3D THREE.JS PRINCIPAL */}
      <GandiaWorld3D
        zoneId={zone.id}
        cases={CASES}
        doneCases={save.cases}
        onInteractAnimal={handleInteractAnimal}
        onTalkNPC={handleTalkNPC}
        onInspectClue={handleInspectClue}
        onZoneTravel={(target) => setManualZone(target)}
        onLookUpdate={handleLookUpdate}
        virtualInput={virtualInput}
        photoModeActive={photoModeActive}
        onCaptureReady={(fn) => { captureFnRef.current = fn; }}
        cameraMode={cameraMode}
        isFootMode={isFootMode}
        sirenActive={sirenActive}
        headlightsActive={headlightsActive}
        onToggleFootMode={() => setIsFootMode((v) => !v)}
        onCycleCamera={toggleCameraMode}
        onHonkReady={(fn) => { honkRef.current = fn; }}
        onToggleSiren={() => setSirenActive((v) => !v)}
        onToggleHeadlights={() => setHeadlightsActive((v) => !v)}
      />

      {/* Capa de compatibilidad para tests */}
      <div style={{ display: 'none' }}>
        <Panorama360
          src={zone.img}
          hotspots={hotspots}
          sensitivity={sensitivity}
          initialYaw={zone.initialYaw}
          onLook={({ headingDeg: h }) => {}}
          loadingLabel={t('panoLoading')}
          errorLabel={t('panoError')}
          zoneName={zoneName}
          zoneCoord={`${zone.lat.toFixed(4)}° N, ${Math.abs(zone.lng).toFixed(4)}° ${zone.lng >= 0 ? 'E' : 'W'}`}
          t={t}
        />
      </div>

      <div className="game-vignette" />

      {/* 2. CABECERA SUPERIOR */}
      <header className="game-header">
        <button className="game-back" onClick={goMenu}><ArrowLeft size={19} /><span>{t('leave')}</span></button>
        <div className="game-location">
          <span><MapPin size={15} /></span>
          <div><strong>{zoneName}</strong><small>{t('z' + zone.id[0].toUpperCase() + zone.id.slice(1) + 'D')} · GANDÍA 3D</small></div>
        </div>
        <div className="game-status">
          <span className={`status-live ${hasGps ? '' : 'status-live--off'}`} />
          <span>{hasGps ? `${t('gpsOn')} · ±${Math.round(geo.position.accuracy)} m` : 'Simulador GPS 3D'}</span>
          <XpBar level={level} progress={levelProgress(save.xp)} t={t} compact />
        </div>
      </header>

      {!hasGps && !noGpsDismissed && (
        <div className="gps-warning">
          <FileWarning size={16} />
          <span>{t('noGpsWarn')} Conduce la furgoneta hacia el punto de aviso en el mapa 3D.</span>
          <button onClick={() => setNoGpsDismissed(true)} aria-label={t('close')}><ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} /></button>
        </div>
      )}

      <CompassBar heading={headingDeg} t={t} />

      {/* 3. TARJETA DE AVISO ACTIVO */}
      <section className={`case-card ${showMissions ? '' : 'case-card--closed'}`}>
        <button className="case-toggle" onClick={() => setShowMissions(!showMissions)}>
          <span className="siren-icon"><Bell size={14} /><i /></span>
          <span>{t('currentCase')}</span>
          <ChevronDown size={16} />
        </button>
        <div className="case-body">
          <div className="animal-avatar"><span>{speciesById(selectedCase.species)?.emoji}</span></div>
          <div className="case-title">
            <div>
              <h3>{t(`${selectedCase.id}T`)}</h3>
              <span><i />{t(`${selectedCase.id}C`)}</span>
            </div>
            <strong>{caseDistance != null ? formatDistance(caseDistance) : 'En patrulla 3D'}</strong>
          </div>
          <div className="case-separator" />
          <p><Info size={15} />{hasGps ? t('geoHint') : 'Acércate con la furgoneta al animal en el entorno 3D para atenderlo.'}</p>
          <div className="case-actions">
            <button className="case-intervene" onClick={() => setCareCaseId(selectedCase.id)}>
              <HeartPulse size={16} />{t('intervene')}
            </button>
            {hasGps && (
              <a
                className="case-route"
                href={`https://www.google.com/maps/dir/?api=1&destination=${caseCoords(selectedCase).lat},${caseCoords(selectedCase).lng}`}
                target="_blank"
                rel="noreferrer"
              ><ExternalLink size={14} />{t('howTo')}</a>
            )}
          </div>
        </div>
      </section>

      {/* 4. PANEL DE RADAR 3D Y ZONAS */}
      <aside className="rescue-map-panel glass-panel">
        <div className="map-panel-head">
          <div><span>{t('radarTitle')}</span><strong>{zoneName}</strong></div>
          <span className={`map-gps-chip ${hasGps ? 'is-on' : ''}`}>{hasGps ? <Navigation size={13} /> : <Zap size={13} />}</span>
        </div>
        <Radar
          t={t}
          gps={geo.position}
          heading={headingDeg}
          doneCases={save.cases}
          selectedCaseId={selectedCase.id}
          onSelect={setSelectedCaseId}
        />
        <div className="zone-chips">
          {ZONES.map((z) => {
            const locked = hasGps;
            return (
              <button
                key={z.id}
                className={z.id === zone.id ? 'is-active' : ''}
                disabled={locked}
                onClick={() => setManualZone(z.id)}
                title={locked ? t('gpsOn') : undefined}
              >{t(`z${z.id[0].toUpperCase()}${z.id.slice(1)}`)}</button>
            );
          })}
        </div>
        <ZonePhotos
          t={t}
          zoneId={zone.id}
          photos={save.photos[zone.id]}
          onAddFiles={onAddPhotos}
          onRemove={(id) => actions.removePhoto(zone.id, id)}
          bonusNote={!save.photoXpZones.includes(zone.id) ? t('firstPhotoXp') : null}
        />
      </aside>

      {/* 5. PANEL DE CONTROL DE LA FURGONETA */}
      <VanControlsHUD
        speedKmh={speedKmh}
        sirenActive={sirenActive}
        onToggleSiren={() => setSirenActive((v) => !v)}
        headlightsActive={headlightsActive}
        onToggleHeadlights={() => setHeadlightsActive((v) => !v)}
        cameraMode={cameraMode}
        onChangeCamera={toggleCameraMode}
        isFootMode={isFootMode}
        onToggleFootMode={() => setIsFootMode((v) => !v)}
        onHonk={() => honkRef.current?.()}
        isMobile={isMobile}
        onVirtualInput={(inp) => setVirtualInput((prev) => ({ ...prev, ...inp }))}
        t={t}
      />

      {/* 6. BARRA DE EQUIPAMIENTO */}
      <div className="equipment-rail">
        <span className="rail-label">{t('equipment')}</span>
        {[
          { id: 'food', label: t('food'), icon: UtensilsCrossed, count: '3' },
          { id: 'care', label: t('care'), icon: HeartPulse, count: '2' },
          { id: 'torch', label: t('torch'), icon: Zap, count: '' },
          { id: 'radio', label: t('radio'), icon: Radio, count: '1' },
        ].map(({ id, label, icon: Icon, count }) => (
          <button key={id} className={id === 'food' ? 'active' : ''}><Icon size={20} /><small>{label}</small>{count && <i>{count}</i>}</button>
        ))}
      </div>

      {!isMobile && (
        <div className="pano-hint">
          <Navigation size={13} />
          WASD / Flechas: Conducir furgoneta · [E] Atender aviso · [V] Vista · [B] Sirena
        </div>
      )}

      {/* 7. MODALES */}
      {photoModeActive && (
        <PhotoMode3D
          onCapture={() => captureFnRef.current?.()}
          onClose={() => setPhotoModeActive(false)}
          zoneName={zoneName}
          onSavePhoto={handleSave3DPhoto}
          notify={notify}
          t={t}
        />
      )}

      {activeDialogueNpc && (
        <DialogueModal
          npcData={activeDialogueNpc}
          onClose={() => setActiveDialogueNpc(null)}
          onRewardXp={(xp) => { actions.awardXp(xp); notify(`⭐ +${xp} XP de historia local`); }}
        />
      )}

      {activeClue && (
        <ClueModal
          clueData={activeClue}
          onClose={() => setActiveClue(null)}
        />
      )}

      {careCaseId && (
        <CareSheet
          t={t}
          caseData={caseById(careCaseId)}
          mode="rescue"
          onAction={onAction}
          onClose={() => setCareCaseId(null)}
        />
      )}

      {success && (
        <SuccessToast
          t={t}
          xp={success.xp}
          flags={success.flags}
          newSpecies={success.newSpecies}
          isLevelUp={!!levelUp}
          onClose={() => setSuccess(null)}
          onViewCard={() => { setSuccess(null); onOpenSpecies(); }}
          onShelter={() => { setSuccess(null); onOpenShelter(); }}
        />
      )}

      {levelUp && (
        <LevelUpToast
          t={t}
          level={levelUp.level}
          unlocked={levelUp.unlocked}
          onClose={() => setLevelUp(null)}
          onShelter={() => { setLevelUp(null); onOpenShelter(); }}
        />
      )}
    </main>
  );
}
