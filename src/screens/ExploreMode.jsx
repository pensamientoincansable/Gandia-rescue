import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft, Bell, Camera, ChevronRight, HeartPulse, Image as ImageIcon,
  Map as MapIcon, MapPin, Navigation, PawPrint, Eye, User, Radio, Sun, Volume2, Sparkles, MessageSquare,
} from 'lucide-react';
import GandiaWorld3D from '../three/GandiaWorld3D.jsx';
import Panorama360 from '../components/Panorama360.jsx';
import DialogueModal from '../components/DialogueModal.jsx';
import ClueModal from '../components/ClueModal.jsx';
import PhotoMode3D from '../components/PhotoMode3D.jsx';
import VanControlsHUD from '../components/VanControlsHUD.jsx';
import {
  CareSheet, CompassBar, SuccessToast, Toast, TravelMap, XpBar, ZonePhotos, ModalShell,
} from '../components/common.jsx';
import {
  CASES, fileToDataUrl, formatDistance, levelForXp, levelProgress, speciesById,
  zoneById, ZONE_LINKS, distanceM,
} from '../lib/game.js';

/**
 * Modo Exploración 3D: Mundo abierto interactivo de Gandía en Three.js.
 * Permite desplazarse con la Furgoneta de Rescate y a pie, hablar con lugareños
 * sobre la historia y tradiciones, investigar pistas medioambientales,
 * tomar fotos con la Cámara de Guardián y rescatar animales.
 */
export default function ExploreMode({
  t, goMenu, isMobile, save, actions, onOpenSpecies, sensitivity, notify, initialZone = 'platja',
}) {
  const [zoneId, setZoneId] = useState(initialZone);
  const [travelOpen, setTravelOpen] = useState(false);
  const [missionsOpen, setMissionsOpen] = useState(!isMobile);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [careCaseId, setCareCaseId] = useState(null);
  const [activeDialogueNpc, setActiveDialogueNpc] = useState(null);
  const [activeClue, setActiveClue] = useState(null);
  const [photoModeActive, setPhotoModeActive] = useState(false);
  const [success, setSuccess] = useState(null);

  // Estados de control de la Furgoneta 3D
  const [speedKmh, setSpeedKmh] = useState(0);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [sirenActive, setSirenActive] = useState(false);
  const [headlightsActive, setHeadlightsActive] = useState(true);
  const [cameraMode, setCameraMode] = useState('chase'); // 'chase' | 'hood' | 'top'
  const [isFootMode, setIsFootMode] = useState(false);
  const [virtualInput, setVirtualInput] = useState({});

  const captureFnRef = useRef(null);

  const zone = zoneById(zoneId);
  const zoneName = t(`z${zone.id[0].toUpperCase()}${zone.id.slice(1)}`);

  useEffect(() => { actions.visitZone(zoneId); }, [zoneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoneCases = CASES.filter((c) => c.zone === zoneId);

  /* Hotspots compatibles */
  const hotspots = useMemo(() => {
    const spots = (ZONE_LINKS[zoneId] ?? []).map((link) => {
      const target = zoneById(link.to);
      const km = formatDistance(distanceM(zone, target));
      return {
        id: `link-${link.to}`,
        kind: 'arrow',
        yaw: link.yaw,
        pitch: -12,
        label: t(`z${link.to[0].toUpperCase()}${link.to.slice(1)}`),
        node: (
          <span className="pano-arrow">
            <i><Navigation size={16} /></i>
            <b>{t(`z${link.to[0].toUpperCase()}${link.to.slice(1)}`)}</b>
            <small>{km}</small>
          </span>
        ),
        onClick: () => setZoneId(target.id),
      };
    });
    for (const cse of zoneCases) {
      if ((save.cases[cse.id] ?? 0) > 0) continue;
      spots.push({
        id: `case-${cse.id}`,
        kind: 'marker',
        yaw: (cse.off[0] * 1e5 + cse.off[1] * 1e5) % 360,
        pitch: -6,
        label: t(`${cse.id}T`),
        node: (
          <span className="pano-marker">
            <i><PawPrint size={15} /></i>
            <b>{t(`${cse.id}T`)}</b>
            <small>{t('missions')}</small>
          </span>
        ),
        onClick: () => setCareCaseId(cse.id),
      });
    }
    return spots;
  }, [zoneId, zoneCases, save.cases, t]); // eslint-disable-line react-hooks/exhaustive-deps

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
    notify(`🔍 Pista descubierta: ${clueData.title} (+15 XP)`);
  };

  const onAction = (action) => {
    const cse = CASES.find((c) => c.id === careCaseId);
    if (!cse) return;
    const alreadyDone = (save.cases[cse.id] ?? 0) > 0;
    const result = actions.completeRescue(cse.id, { xp: 0, unlockSpecies: true });
    setCareCaseId(null);
    setSuccess({ xp: 0, flags: [], newSpecies: result?.newSpecies ?? null, replay: alreadyDone });
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
    if (added > 0) notify(t('photoAdded'));
  };

  const handleSave3DPhoto = (dataUrl) => {
    if (actions.addPhoto(zone.id, dataUrl)) {
      notify('📸 Fotografía guardada en el álbum de la zona');
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
    <main className="game-screen explore-game screen-enter">
      {/* 1. MUNDO 3D THREE.JS PRINCIPAL */}
      <GandiaWorld3D
        zoneId={zoneId}
        cases={CASES}
        doneCases={save.cases}
        onInteractAnimal={handleInteractAnimal}
        onTalkNPC={handleTalkNPC}
        onInspectClue={handleInspectClue}
        onZoneTravel={(target) => setZoneId(target)}
        onLookUpdate={handleLookUpdate}
        virtualInput={virtualInput}
        photoModeActive={photoModeActive}
        onCaptureReady={(fn) => { captureFnRef.current = fn; }}
        cameraMode={cameraMode}
        isFootMode={isFootMode}
        sirenActive={sirenActive}
        headlightsActive={headlightsActive}
      />

      {/* Visor 360° invisible o en capa de compatibilidad */}
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

      <div className="game-vignette explore-vignette" />

      {/* 2. CABECERA SUPERIOR */}
      <header className="game-header">
        <button className="game-back" onClick={goMenu}><ArrowLeft size={19} /><span>{t('leave')}</span></button>
        <div className="game-location">
          <span><MapPin size={15} /></span>
          <div><strong>{zoneName}</strong><small>{t('z' + zone.id[0].toUpperCase() + zone.id.slice(1) + 'D')} · GANDÍA 3D</small></div>
        </div>
        <div className="game-status">
          <span className="status-live status-live--virtual" />
          <span>{t('exploreNoXp')}</span>
          <XpBar level={level} progress={levelProgress(save.xp)} t={t} compact />
        </div>
      </header>

      <CompassBar heading={headingDeg} t={t} />

      {/* Título de la zona */}
      <div className="explore-title">
        <span><Navigation size={16} />{t('explore')} · 3D</span>
        <h1>{zoneName}</h1>
        <p><Camera size={15} />{t('virtualHint')}</p>
      </div>

      {/* 3. PANEL LATERAL DE MISIONES Y FOTOS */}
      <aside className={`explore-map-panel glass-panel ${missionsOpen ? '' : 'is-collapsed'}`}>
        <div className="map-panel-head">
          <div><span>{t('missionsZone')}</span><strong>{zoneName}</strong></div>
          <button onClick={() => setTravelOpen(true)} aria-label={t('mapTitle')}><MapIcon size={17} /></button>
        </div>
        {zoneCases.length === 0 && <p className="explore-empty">{t('noMissions')}</p>}
        {zoneCases.map((cse) => {
          const done = (save.cases[cse.id] ?? 0) > 0;
          const sp = speciesById(cse.species);
          return (
            <button key={cse.id} className={`mission-row ${done ? 'is-done' : ''}`} onClick={() => setCareCaseId(cse.id)}>
              <span className="mission-row__emoji">{sp?.emoji}</span>
              <span className="mission-row__copy">
                <strong>{t(`${cse.id}T`)}</strong>
                <small>{t(`${cse.id}C`)}</small>
              </span>
              {done ? <em className="mission-done">{t('completed')}</em> : <ChevronRight size={16} />}
            </button>
          );
        })}
        <ZonePhotos
          t={t}
          zoneId={zone.id}
          photos={save.photos[zone.id]}
          onAddFiles={onAddPhotos}
          onRemove={(id) => actions.removePhoto(zone.id, id)}
        />
        <div className="explore-links">
          <button onClick={() => setTravelOpen(true)}><MapIcon size={15} />{t('mapTitle')}</button>
          <button onClick={() => setPhotosOpen(true)}><ImageIcon size={15} />{t('photosTitle')}</button>
        </div>
      </aside>

      {/* 4. PANEL HUD DE CONTROL DE LA FURGONETA */}
      <VanControlsHUD
        speedKmh={speedKmh}
        sirenActive={sirenActive}
        onToggleSiren={() => setSirenActive(!sirenActive)}
        headlightsActive={headlightsActive}
        onToggleHeadlights={() => setHeadlightsActive(!headlightsActive)}
        cameraMode={cameraMode}
        onChangeCamera={toggleCameraMode}
        isFootMode={isFootMode}
        onToggleFootMode={() => setIsFootMode(!isFootMode)}
        onHonk={() => {}}
        isMobile={isMobile}
        onVirtualInput={(inp) => setVirtualInput((prev) => ({ ...prev, ...inp }))}
        t={t}
      />

      {/* 5. ACCIONES RÁPIDAS INFERIORES */}
      <div className="quick-actions">
        <button onClick={() => setMissionsOpen(!missionsOpen)}><Bell /><span>{t('missions')}</span></button>
        <button onClick={() => setTravelOpen(true)}><MapIcon /><span>{t('mapTitle')}</span></button>
        <button onClick={() => setPhotoModeActive(true)}><Camera /><span>Cámara 3D</span></button>
      </div>

      {!isMobile && (
        <div className="pano-hint">
          <Navigation size={13} />
          WASD / Flechas: Conducir · [E] Interactuar / Hablar · [V] Cámara · [B] Sirena
        </div>
      )}

      {/* 6. MODALES Y PANTALLAS SUPERPUESTAS */}
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

      {travelOpen && (
        <ModalShell close={() => setTravelOpen(false)} title={t('mapTitle')} icon={MapIcon} wide>
          <TravelMap
            t={t}
            currentZone={zoneId}
            heading={headingDeg}
            doneCases={save.cases}
            onTravel={(id) => { setZoneId(id); setTravelOpen(false); }}
          />
        </ModalShell>
      )}

      {photosOpen && (
        <ModalShell close={() => setPhotosOpen(false)} title={t('photosTitle')} icon={ImageIcon} wide>
          <ZonePhotos
            t={t}
            zoneId={zone.id}
            photos={save.photos[zone.id]}
            onAddFiles={onAddPhotos}
            onRemove={(id) => actions.removePhoto(zone.id, id)}
          />
        </ModalShell>
      )}

      {careCaseId && (
        <CareSheet
          t={t}
          caseData={CASES.find((c) => c.id === careCaseId)}
          mode="explore"
          onAction={onAction}
          onClose={() => setCareCaseId(null)}
        />
      )}

      {success && (
        <SuccessToast
          t={t}
          xp={0}
          flags={[]}
          newSpecies={success.newSpecies}
          onClose={() => setSuccess(null)}
          onViewCard={() => { setSuccess(null); onOpenSpecies(); }}
        />
      )}
    </main>
  );
}
