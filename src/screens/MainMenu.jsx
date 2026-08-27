import { useState } from 'react';
import {
  Bell, BookOpen, Check, ChevronDown, ChevronRight, Compass, Home, Info, Languages, Leaf,
  MapPin, Monitor, Navigation, Settings, ShieldCheck, Smartphone, Sun, Volume2, VolumeX, Waves, Mountain,
} from 'lucide-react';
import { levelForXp, levelProgress, photoCount } from '../lib/game.js';
import { XpBar } from '../components/common.jsx';

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <div className="brand__mark"><Waves size={22} strokeWidth={2.5} /><Mountain size={17} strokeWidth={2.5} /></div>
      <div className="brand__type"><strong>GANDÍA</strong><span>RESCATE & EXPLORACIÓN</span></div>
    </div>
  );
}

function TopNav({ t, language, setLanguage, muted, setMuted, openModal, profile }) {
  const [languageOpen, setLanguageOpen] = useState(false);
  return (
    <header className="topnav">
      <Brand />
      <nav className="topnav__links" aria-label="Navegación principal">
        <button onClick={() => openModal('species')}><BookOpen size={16} />{t('species')}</button>
        <button onClick={() => openModal('info')}><Info size={16} />{t('credits')}</button>
      </nav>
      <div className="topnav__actions">
        <button className="icon-button" aria-label="Sonido" onClick={() => setMuted(!muted)}>{muted ? <VolumeX /> : <Volume2 />}</button>
        <div className="language-control">
          <button className="language-button" onClick={() => setLanguageOpen(!languageOpen)} aria-expanded={languageOpen}>
            <Languages size={17} /><span>{language.toUpperCase()}</span><ChevronDown size={14} />
          </button>
          {languageOpen && (
            <div className="language-menu">
              {Object.entries({ es: 'Español', va: 'Valencià', en: 'English' }).map(([key, name]) => (
                <button key={key} className={language === key ? 'is-active' : ''} onClick={() => { setLanguage(key); setLanguageOpen(false); }}>
                  <span>{name}</span>{language === key && <Check size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="icon-button" aria-label={t('settings')} onClick={() => openModal('settings')}><Settings /></button>
        <button className="avatar-button" onClick={() => openModal('profile')} aria-label={t('profile')}>
          <span className="avatar-button__emoji">{profile.avatar}</span><i />
        </button>
      </div>
    </header>
  );
}

function PlayerCard({ t, openProfile, save }) {
  const level = levelForXp(save.xp);
  return (
    <aside className="player-card glass-panel">
      <div className="player-card__top">
        <button className="player-identity" onClick={openProfile}>
          <span className="player-avatar"><span className="player-avatar__emoji">{save.profile.avatar}</span></span>
          <span>
            <small>{t('player')}</small>
            <strong>{save.profile.name}</strong>
          </span>
        </button>
        <span className="level-pill">{t('levelShort')} {level}</span>
      </div>
      <XpBar level={level} progress={levelProgress(save.xp)} t={t} compact />
      <div className="player-stats">
        <div><strong>{save.rescues}</strong><span>{t('rescued')}</span></div>
        <div><strong>{photoCount(save)}</strong><span>{t('photos')}</span></div>
        <div><strong>{save.species.length}</strong><span>{t('badges')}</span></div>
      </div>
      <div className="tip-card">
        <span className="tip-icon"><Leaf size={17} /></span>
        <div><strong>{t('tip')}</strong><p>{t('tipText')}</p></div>
      </div>
    </aside>
  );
}

function ModeCard({ kind, t, onStart, badge = null }) {
  const meta = {
    rescue: { cls: 'rescue', icon: ShieldCheck, title: 'startRescue', desc: 'rescueDesc', label: 'rescueLabel' },
    explore: { cls: 'explore', icon: Compass, title: 'startExplore', desc: 'exploreDesc', label: 'exploreLabel' },
    shelter: { cls: 'shelter', icon: Home, title: 'startShelter', desc: 'shelterDesc', label: 'shelterLabel' },
  }[kind];
  const Icon = meta.icon;
  return (
    <button className={`mode-card mode-card--${meta.cls}`} onClick={() => onStart(kind)}>
      <div className="mode-card__icon"><Icon size={27} /></div>
      <div className="mode-card__copy">
        <span>{t(meta.label)}</span>
        <h2>{t(meta.title)}</h2>
        <p>{t(meta.desc)}</p>
      </div>
      <span className="mode-card__arrow"><ChevronRight /></span>
      {badge}
    </button>
  );
}

export default function MainMenu({ t, language, setLanguage, muted, setMuted, openModal, startMode, save }) {
  const pendingCases = 6 - Object.values(save.cases ?? {}).filter((n) => n > 0).length;
  return (
    <main className="menu-screen screen-enter">
      <div className="menu-background" />
      <div className="menu-vignette" />
      <TopNav {...{ t, language, setLanguage, muted, setMuted, openModal }} profile={save.profile} />
      <div className="menu-content">
        <section className="hero-copy">
          <div className="status-line"><span /><Navigation size={14} />{t('online')}</div>
          <div className="eyebrow">{t('eyebrow')}</div>
          <h1>{t('titleA')}<br /><em>{t('titleB')}</em></h1>
          <p>{t('intro')}</p>
          <div className="location-row">
            <span><Sun size={16} /> 24°C</span>
            <span><MapPin size={16} /> Gandía, La Safor</span>
          </div>
        </section>
        <PlayerCard t={t} openProfile={() => openModal('profile')} save={save} />
      </div>
      <section className="mode-section">
        <div className="mode-section__heading">
          <span>{t('menu')}</span>
          <small><Monitor size={14} /><Smartphone size={14} />{t('compatibleTitle')}</small>
        </div>
        <div className="mode-grid mode-grid--3">
          <ModeCard kind="rescue" t={t} onStart={startMode} badge={<span className="alert-dot"><Bell size={12} />{pendingCases} {t('alertsPending')}</span>} />
          <ModeCard kind="explore" t={t} onStart={startMode} />
          <ModeCard kind="shelter" t={t} onStart={startMode} />
        </div>
      </section>
      <div className="menu-footer"><span>© GANDÍA NATURA</span><span>39.0007° N · 0.1660° W</span></div>
    </main>
  );
}
