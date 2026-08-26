import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award, BookOpen, Check, Compass, Home, Info, Languages, Leaf, MapPin, Monitor, Mountain,
  PawPrint, ShieldCheck, SlidersHorizontal, Smartphone, Sun, Trash2, Trophy, UserRound, Volume2, VolumeX, Waves,
} from 'lucide-react';
import { copy, languageNames } from './lib/i18n.js';
import {
  MOBILE_QUERY, SAFOR_GUARDIAN_TARGET, levelForXp, levelProgress,
  safeMatchMedia, safeStorage, useGame, useT,
} from './lib/game.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import Onboarding from './screens/Onboarding.jsx';
import MainMenu from './screens/MainMenu.jsx';
import RescueMode from './screens/RescueMode.jsx';
import ExploreMode from './screens/ExploreMode.jsx';
import Shelter from './screens/Shelter.jsx';
import { ModalShell, SpeciesGallery, Toast } from './components/common.jsx';

/* ------------------------------------------------------------------ */
/* Pantalla de carga                                                   */
/* ------------------------------------------------------------------ */
function LoadingScreen({ t, mode, progress }) {
  return (
    <main className={`loading-screen loading-screen--${mode}`}>
      <div className="loading-background" />
      <div className="loading-shade" />
      <div className="loading-brand"><Brand /></div>
      <div className="loading-content">
        <div className="loading-orbit"><span /><div>{mode === 'rescue' ? <PawPrint /> : mode === 'shelter' ? <Home /> : <Compass />}</div></div>
        <span className="loading-kicker">{mode === 'rescue' ? t('loadingRescue') : mode === 'shelter' ? t('loadingShelter') : t('loadingExplore')}</span>
        <h2>{t('loadingMap')}</h2>
        <div className="loading-progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="loading-meta"><span>{progress}%</span><span>GND-04</span></div>
        <div className="loading-fact"><Leaf size={19} /><p><strong>¿SABÍAS QUE?</strong>{t('fact')}</p></div>
      </div>
    </main>
  );
}

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <div className="brand__mark"><Waves size={22} strokeWidth={2.5} /><Mountain size={17} strokeWidth={2.5} /></div>
      <div className="brand__type"><strong>GANDÍA</strong><span>RESCATE & EXPLORACIÓN</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modales                                                             */
/* ------------------------------------------------------------------ */
function SettingsModal({ t, language, setLanguage, muted, setMuted, lookSpeed, setLookSpeed, onReset, close }) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <ModalShell close={close} title={t('settings')} icon={Sun}>
      <div className="setting-list">
        <div className="setting-row">
          <span className="setting-row__icon"><Volume2 /></span>
          <div><strong>{t('audio')}</strong><small>{t('audioDesc')}</small></div>
          <button className={`toggle ${!muted ? 'on' : ''}`} onClick={() => setMuted(!muted)} aria-label={t('audio')}><i /></button>
        </div>
        <div className="setting-row setting-row--select">
          <span className="setting-row__icon"><Languages /></span>
          <div><strong>{t('language')}</strong><small>{t('langDesc')}</small></div>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {Object.entries(languageNames).map(([key, val]) => <option key={key} value={key}>{val}</option>)}
          </select>
        </div>
        <div className="setting-row setting-row--range">
          <span className="setting-row__icon"><SlidersHorizontal /></span>
          <div><strong>{t('lookSpeed')}</strong><small>{t('lookSpeedDesc')}</small></div>
          <span>{lookSpeed}%</span>
          <input type="range" min="20" max="100" value={lookSpeed} onChange={(e) => setLookSpeed(Number(e.target.value))} />
        </div>
        <div className="setting-row setting-row--select">
          <span className="setting-row__icon"><Monitor /></span>
          <div><strong>{t('graphics')}</strong><small>{t('automatic')}</small></div>
          <select defaultValue="auto"><option value="auto">{t('automatic')}</option><option value="high">{t('high')}</option><option value="medium">{t('medium')}</option><option value="low">{t('low')}</option></select>
        </div>
        <div className="setting-row setting-row--danger">
          <span className="setting-row__icon"><Trash2 /></span>
          <div><strong>{t('resetTitle')}</strong><small>{t('resetDesc')}</small></div>
          {confirmReset ? (
            <span className="reset-confirm">
              <button onClick={onReset}>{t('yes')}</button>
              <button onClick={() => setConfirmReset(false)}>{t('no')}</button>
            </span>
          ) : (
            <button className="reset-button" onClick={() => setConfirmReset(true)}>{t('resetTitle')}</button>
          )}
        </div>
      </div>
      <button className="modal-primary" onClick={close}><Check size={18} />{t('save')}</button>
    </ModalShell>
  );
}

function ProfileModal({ t, save, actions, close }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(save.profile.name);
  const [avatar, setAvatar] = useState(save.profile.avatar);
  const level = levelForXp(save.xp);
  const AVATARS = ['🦊', '🐱', '🦉', '🦔', '🐰', '🐗'];
  return (
    <ModalShell close={close} title={t('yourProgress')} icon={UserRound} wide>
      {!editing ? (
        <div className="profile-hero">
          <span className="profile-big-avatar">{save.profile.avatar}<i /></span>
          <div>
            <span>{t('level')} {level} · {Math.round(levelProgress(save.xp) * 100)}%</span>
            <h2>{save.profile.name}</h2>
            <p>Guardiana local · Gandía</p>
            <div className="profile-xp"><span><i style={{ width: `${Math.round(levelProgress(save.xp) * 100)}%` }} /></span><small>{save.xp % 150} / 150 {t('xp')} · {t('xpToNext')}</small></div>
          </div>
          <button className="profile-edit" onClick={() => setEditing(true)}>{t('editProfile')}</button>
        </div>
      ) : (
        <div className="profile-edit-form">
          <label className="onboarding__label" htmlFor="profile-name">{t('yourName')}</label>
          <input id="profile-name" className="onboarding__input" value={name} maxLength={22} onChange={(e) => setName(e.target.value)} />
          <span className="onboarding__label">{t('chooseAvatar')}</span>
          <div className="onboarding__avatars">
            {AVATARS.map((a) => (
              <button key={a} type="button" className={avatar === a ? 'is-active' : ''} onClick={() => setAvatar(a)}>
                <span>{a}</span>{avatar === a && <i><Check size={12} /></i>}
              </button>
            ))}
          </div>
          <div className="profile-edit-actions">
            <button className="modal-primary" onClick={() => { actions.updateProfile(name, avatar); setEditing(false); }}>
              <Check size={16} />{t('saveChanges')}
            </button>
          </div>
        </div>
      )}
      <div className="profile-stat-grid">
        <div><PawPrint /><strong>{save.rescues}</strong><span>{t('animalsHelped')}</span></div>
        <div><MapPin /><strong>{save.visited.length}</strong><span>{t('places')}</span></div>
        <div><Trophy /><strong>{save.shelter.placed.length}</strong><span>{t('achievements')}</span></div>
        <div><BookOpen /><strong>{save.species.length}/8</strong><span>{t('collection')}</span></div>
      </div>
      <div className="achievement-card">
        <span><Award /></span>
        <div><small>{t('recent')}</small><strong>{t('guardian')}</strong><p>{t('guardianDesc')}</p></div>
        <b>{Math.min(save.rescues, SAFOR_GUARDIAN_TARGET)} / {SAFOR_GUARDIAN_TARGET}</b>
      </div>
    </ModalShell>
  );
}

function SpeciesModal({ t, save, close }) {
  return (
    <ModalShell close={close} title={t('learn')} icon={BookOpen} wide>
      <SpeciesGallery t={t} unlockedSpecies={save.species} />
    </ModalShell>
  );
}

function InfoModal({ t, close }) {
  return (
    <ModalShell close={close} title="Gandía Natura" icon={Leaf} wide>
      <div className="info-hero">
        <div><Waves /><Mountain /></div>
        <span>CONSERVACIÓN · EDUCACIÓN · EXPLORACIÓN</span>
        <h2>Conocer para proteger.</h2>
        <p>Una experiencia educativa ambientada en Gandía que acerca la fauna y los paisajes de La Safor a todas las personas.</p>
      </div>
      <div className="info-columns">
        <div><strong>Desplazamiento real y virtual</strong><p>En el modo rescate te mueves por el mundo real con tu GPS; en el modo exploración viajas entre panoramas 360° desde cualquier lugar.</p></div>
        <div><strong>Una Gandía viva</strong><p>Playa, marjal, huerta, ciudad y montaña conviven en un territorio de enorme diversidad.</p></div>
      </div>
      <div className="credits-row"><span>Diseñado con respeto por la fauna local</span><span>VERSIÓN 2.0 · 2026</span></div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
function AppInner() {
  const [save, actions] = useGame();
  const [language, setLanguageState] = useState(() => {
    const stored = safeStorage.get('gandia-language');
    return stored && stored in copy ? stored : 'es';
  });
  const [screen, setScreen] = useState(save.profile ? 'menu' : 'onboarding');
  const [loadingMode, setLoadingMode] = useState('rescue');
  const [progress, setProgress] = useState(0);
  const [modal, setModal] = useState(null);
  const [muted, setMuted] = useState(false);
  const [lookSpeed, setLookSpeedState] = useState(() => {
    const stored = Number(safeStorage.get('gandia-lookspeed'));
    return Number.isFinite(stored) && stored >= 20 && stored <= 100 ? stored : 64;
  });
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);
  const isMobile = useIsMobileSafe();

  const t = useT(language);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    safeStorage.set('gandia-language', lang);
    document.documentElement.lang = lang === 'va' ? 'ca' : lang;
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'va' ? 'ca' : language;
  }, [language]);

  const setLookSpeed = (value) => {
    setLookSpeedState(value);
    safeStorage.set('gandia-lookspeed', String(value));
  };

  const notify = useCallback((text, tone = 'ok') => {
    const id = (toastSeq.current += 1);
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    if (screen !== 'loading') return undefined;
    setProgress(4);
    const started = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - started;
      const next = Math.min(100, Math.round(4 + (elapsed / 1600) * 96));
      setProgress(next);
      if (next >= 100) {
        window.clearInterval(interval);
        window.setTimeout(() => setScreen(loadingMode), 160);
      }
    }, 45);
    return () => window.clearInterval(interval);
  }, [screen, loadingMode]);

  const startMode = (kind) => {
    setLoadingMode(kind);
    setScreen('loading');
  };

  const sensitivity = useMemo(() => 0.2 + (lookSpeed / 100) * 1.0, [lookSpeed]);

  if (!save.profile || screen === 'onboarding') {
    return (
      <div className="app-shell">
        <Onboarding
          t={t}
          language={language}
          setLanguage={setLanguage}
          onCreate={(name, avatar) => { actions.createProfile(name, avatar); setScreen('menu'); }}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {screen === 'menu' && (
        <MainMenu {...{ t, language, setLanguage, muted, setMuted, save }} openModal={setModal} startMode={startMode} />
      )}
      {screen === 'loading' && <LoadingScreen t={t} mode={loadingMode} progress={progress} />}
      {screen === 'rescue' && (
        <RescueMode
          t={t}
          goMenu={() => setScreen('menu')}
          isMobile={isMobile}
          save={save}
          actions={actions}
          onOpenSpecies={() => setModal('species')}
          onOpenShelter={() => { setLoadingMode('shelter'); setScreen('loading'); }}
          sensitivity={sensitivity}
          notify={notify}
        />
      )}
      {screen === 'explore' && (
        <ExploreMode
          t={t}
          goMenu={() => setScreen('menu')}
          isMobile={isMobile}
          save={save}
          actions={actions}
          onOpenSpecies={() => setModal('species')}
          sensitivity={sensitivity}
          notify={notify}
        />
      )}
      {screen === 'shelter' && (
        <Shelter
          t={t}
          goMenu={() => setScreen('menu')}
          save={save}
          actions={actions}
          notify={notify}
        />
      )}

      {modal === 'settings' && (
        <SettingsModal
          t={t}
          language={language}
          setLanguage={setLanguage}
          muted={muted}
          setMuted={setMuted}
          lookSpeed={lookSpeed}
          setLookSpeed={setLookSpeed}
          onReset={() => { actions.reset(); setModal(null); setScreen('onboarding'); }}
          close={() => setModal(null)}
        />
      )}
      {modal === 'profile' && <ProfileModal t={t} save={save} actions={actions} close={() => setModal(null)} />}
      {modal === 'species' && <SpeciesModal t={t} save={save} close={() => setModal(null)} />}
      {modal === 'info' && <InfoModal t={t} close={() => setModal(null)} />}

      {toasts.map(({ id, text, tone }) => <Toast key={id} text={text} tone={tone} />)}
    </div>
  );
}

/** Hook local para reutilizar la detección de plataforma. */
function useIsMobileSafe() {
  const [isMobile, setIsMobile] = useState(() => safeMatchMedia(MOBILE_QUERY)?.matches ?? false);
  useEffect(() => {
    const media = safeMatchMedia(MOBILE_QUERY);
    if (!media) return undefined;
    const update = () => setIsMobile(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener?.(update);
    return () => media.removeListener?.(update);
  }, []);
  return isMobile;
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}
