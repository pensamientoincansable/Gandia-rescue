import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Bell, Camera, ChevronRight, HeartPulse, Image as ImageIcon,
  Map as MapIcon, MapPin, Navigation, PawPrint,
} from 'lucide-react';
import Panorama360 from '../components/Panorama360.jsx';
import {
  CareSheet, CompassBar, SuccessToast, Toast, TravelMap, XpBar, ZonePhotos, ModalShell,
} from '../components/common.jsx';
import {
  CASES, fileToDataUrl, formatDistance, levelForXp, levelProgress, speciesById,
  zoneById, ZONE_LINKS, distanceM,
} from '../lib/game.js';

/**
 * Modo exploración: desplazamiento virtual estilo Street View.
 * Viajas entre panoramas 360° de Gandía desde cualquier lugar; hay las mismas
 * misiones de rescate, pero completarlas no otorga XP ni sube de nivel.
 */
export default function ExploreMode({
  t, goMenu, isMobile, save, actions, onOpenSpecies, sensitivity, notify, initialZone = 'platja',
}) {
  const [zoneId, setZoneId] = useState(initialZone);
  const [travelOpen, setTravelOpen] = useState(false);
  const [missionsOpen, setMissionsOpen] = useState(!isMobile);
  const [careCaseId, setCareCaseId] = useState(null);
  const [success, setSuccess] = useState(null);
  const [rawYaw, setRawYaw] = useState(0);
  const [photosOpen, setPhotosOpen] = useState(false);

  const zone = zoneById(zoneId);
  const zoneName = t(`z${zone.id[0].toUpperCase()}${zone.id.slice(1)}`);

  useEffect(() => { actions.visitZone(zoneId); }, [zoneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoneCases = CASES.filter((c) => c.zone === zoneId);

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

  const heading = (rawYaw + zone.north + 360) % 360;
  const level = levelForXp(save.xp);

  return (
    <main className="game-screen explore-game screen-enter">
      <Panorama360
        src={zone.img}
        hotspots={hotspots}
        sensitivity={sensitivity}
        initialYaw={zone.initialYaw}
        onLook={({ headingDeg }) => setRawYaw(headingDeg - zone.north)}
        loadingLabel={t('panoLoading')}
        errorLabel={t('panoError')}
      />
      <div className="game-vignette explore-vignette" />

      <header className="game-header">
        <button className="game-back" onClick={goMenu}><ArrowLeft size={19} /><span>{t('leave')}</span></button>
        <div className="game-location">
          <span><MapPin size={15} /></span>
          <div><strong>{zoneName}</strong><small>{t('z' + zone.id[0].toUpperCase() + zone.id.slice(1) + 'D')} · GANDÍA</small></div>
        </div>
        <div className="game-status">
          <span className="status-live status-live--virtual" />
          <span>{t('exploreNoXp')}</span>
          <XpBar level={level} progress={levelProgress(save.xp)} t={t} compact />
        </div>
      </header>

      <CompassBar heading={heading} t={t} />

      <div className="explore-title">
        <span><Navigation size={16} />{t('explore')}</span>
        <h1>{zoneName}</h1>
        <p><Camera size={15} />{t('virtualHint')}</p>
      </div>

      <aside className="explore-map-panel glass-panel">
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

      <div className="quick-actions">
        <button onClick={() => setMissionsOpen(!missionsOpen)}><Bell /><span>{t('missions')}</span></button>
        <button onClick={() => setTravelOpen(true)}><MapIcon /><span>{t('mapTitle')}</span></button>
        <label className="quick-photo">
          <Camera />
          <span>{t('addPhoto')}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) onAddPhotos(files);
            }}
          />
        </label>
      </div>

      {!isMobile && <div className="pano-hint"><Navigation size={13} />{t('moveHint')}</div>}

      {travelOpen && (
        <ModalShell close={() => setTravelOpen(false)} title={t('mapTitle')} icon={MapIcon} wide>
          <TravelMap
            t={t}
            currentZone={zoneId}
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
