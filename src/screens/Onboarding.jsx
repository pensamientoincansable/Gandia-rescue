import { useState } from 'react';
import { ArrowRight, Check, Languages, Waves, Mountain } from 'lucide-react';
import { AVATARS } from '../lib/game.js';
import { languageNames } from '../lib/i18n.js';

/**
 * Creación inicial de perfil: el usuario elige su nombre y su avatar.
 * Empieza en el nivel 1 con 0 XP.
 */
export default function Onboarding({ t, language, setLanguage, onCreate }) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [langOpen, setLangOpen] = useState(false);
  const valid = name.trim().length >= 1;

  const submit = (e) => {
    e.preventDefault();
    if (valid) onCreate(name, avatar);
  };

  return (
    <main className="onboarding screen-enter">
      <div className="menu-background" />
      <div className="menu-vignette" />
      <div className="onboarding__lang">
        <button className="language-button" onClick={() => setLangOpen(!langOpen)} aria-expanded={langOpen}>
          <Languages size={16} /><span>{language.toUpperCase()}</span>
        </button>
        {langOpen && (
          <div className="language-menu">
            {Object.entries(languageNames).map(([key, label]) => (
              <button key={key} className={language === key ? 'is-active' : ''} onClick={() => { setLanguage(key); setLangOpen(false); }}>
                <span>{label}</span>{language === key && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <form className="onboarding__card glass-panel" onSubmit={submit}>
        <div className="onboarding__brand">
          <div className="brand__mark"><Waves size={20} strokeWidth={2.5} /><Mountain size={15} strokeWidth={2.5} /></div>
          <div className="brand__type"><strong>GANDÍA</strong><span>RESCATE & EXPLORACIÓN</span></div>
        </div>
        <span className="onboarding__kicker">NIVEL 1 · NUEVA PARTIDA</span>
        <h1>{t('createTitle')}</h1>
        <p>{t('createSub')}</p>

        <label className="onboarding__label" htmlFor="onboarding-name">{t('yourName')}</label>
        <input
          id="onboarding-name"
          className="onboarding__input"
          value={name}
          maxLength={22}
          placeholder={t('namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <span className="onboarding__label">{t('chooseAvatar')}</span>
        <div className="onboarding__avatars" role="radiogroup" aria-label={t('chooseAvatar')}>
          {AVATARS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={avatar === emoji}
              className={avatar === emoji ? 'is-active' : ''}
              onClick={() => setAvatar(emoji)}
            >
              <span>{emoji}</span>
              {avatar === emoji && <i><Check size={12} /></i>}
            </button>
          ))}
        </div>

        <button className="onboarding__start" type="submit" disabled={!valid}>
          {t('begin')}<ArrowRight size={18} />
        </button>
      </form>
      <div className="menu-footer"><span>© GANDÍA NATURA</span><span>39.0007° N · 0.1660° W</span></div>
    </main>
  );
}
