import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Backpack,
  BatteryMedium,
  Bell,
  Bike,
  Binoculars,
  Bird,
  BookOpen,
  Camera,
  CarFront,
  Cat,
  Check,
  ChevronDown,
  ChevronRight,
  CircleParking,
  Compass,
  Crosshair,
  Footprints,
  Gamepad2,
  Gauge,
  HeartPulse,
  Image as ImageIcon,
  Info,
  Languages,
  Leaf,
  LockKeyhole,
  Map,
  MapPin,
  Menu,
  Monitor,
  Mountain,
  Navigation,
  PawPrint,
  Rabbit,
  Radio,
  RotateCcw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Trophy,
  UserRound,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Waves,
  X,
  Zap,
} from 'lucide-react';

const copy = {
  es: {
    rescue: 'Modo rescate', explore: 'Modo exploración', settings: 'Ajustes', profile: 'Mi perfil', species: 'Especies', credits: 'Información',
    eyebrow: 'GANDÍA · COMUNITAT VALENCIANA', titleA: 'Protege lo que', titleB: 'nos hace únicos.',
    intro: 'Explora Gandía, conoce su fauna y responde a avisos reales de conservación en una aventura sin límites.',
    startRescue: 'Iniciar rescate', rescueDesc: 'Atiende avisos, ayuda a la fauna y aprende a protegerla.',
    startExplore: 'Explorar Gandía', exploreDesc: 'Recorre la costa, la ciudad y el Montdúver a tu ritmo.',
    continue: 'Continuar partida', online: 'Central operativa en línea', activeAlert: '1 aviso cerca de ti',
    menu: 'Menú principal', player: 'Rescatadora', level: 'Nivel 08', rescued: 'Rescatados', photos: 'Avistamientos', badges: 'Logros',
    tip: 'Consejo de conservación', tipText: 'Observa siempre a la fauna a una distancia segura.',
    compatible: 'Disponible en móvil y PC', rescueLabel: 'RESCATE', exploreLabel: 'EXPLORACIÓN LIBRE',
    loadingRescue: 'Preparando el equipo', loadingExplore: 'Trazando tu ruta', loadingMap: 'Cargando Gandía',
    fact: 'El Montdúver alcanza los 841 m y ofrece una de las mejores panorámicas de la Safor.',
    currentCase: 'Aviso activo', boar: 'Jabalí joven', injured: 'Posible deshidratación', distance: 'A 14 metros', calm: 'Acércate despacio. Evita movimientos bruscos.',
    help: 'Ayudar al animal', scan: 'Escaneando entorno', equipment: 'Equipo', food: 'Alimento', care: 'Botiquín', torch: 'Linterna', radio: 'Central',
    compass: 'Brújula', nearby: 'Avisos cercanos', van: 'Furgoneta', supplies: 'Suministros', leave: 'Salir al menú',
    approach: 'Protocolo de ayuda', chooseAction: 'Elige la ayuda adecuada según el estado del animal.', hydrate: 'Ofrecer agua', treat: 'Aplicar cura', observe: 'Observar', safe: 'Zona segura · sin tráfico cercano',
    success: '¡Rescate completado!', successText: 'Has ayudado al animal de forma segura. Nueva ficha educativa desbloqueada.', viewCard: 'Ver ficha', close: 'Cerrar',
    freeRoute: 'Ruta libre', gandiaBeach: 'Platja de Gandia', sunset: 'Atardecer · 24 °C', photoMode: 'Modo foto', changeVehicle: 'Cambiar vehículo',
    currentVehicle: 'Vehículo actual', bicycle: 'Bicicleta urbana', speed: 'Velocidad', battery: 'Autonomía', galleryAdded: 'Foto añadida a tu colección',
    garage: 'Garaje de exploración', chooseVehicle: 'Elige cómo quieres descubrir Gandía', select: 'Seleccionar', selected: 'Seleccionado',
    car: 'Coche eléctrico', motorbike: 'Moto', scooter: 'Patinete', bike: 'Bicicleta', vehicleCarDesc: 'Cómodo y rápido para largas distancias.', vehicleMotoDesc: 'Ágil en los viales de la ciudad.', vehicleBikeDesc: 'Ideal para la costa y los carriles bici.', vehicleScooterDesc: 'Ligero para trayectos urbanos.',
    audio: 'Sonido', sensitivity: 'Sensibilidad', graphics: 'Calidad gráfica', automatic: 'Automática', language: 'Idioma', controls: 'Controles', high: 'Alta', save: 'Guardar cambios',
    yourProgress: 'Tu progreso', collection: 'Colección educativa', animalsHelped: 'Animales ayudados', places: 'Lugares descubiertos', achievements: 'Logros obtenidos', recent: 'Logro reciente', guardian: 'Guardián de la Safor', guardianDesc: 'Completa 10 rescates de fauna local.',
    learn: 'Fauna de la Safor', learnDesc: 'Conoce las especies que comparten Gandía contigo.', common: 'Común', protected: 'Protegido', cautious: 'Cauteloso', urban: 'Urbano',
    platformMobile: 'Controles táctiles activos', platformDesktop: 'Teclado, ratón y mando compatibles',
  },
  va: {
    rescue: 'Mode rescat', explore: "Mode exploració", settings: 'Configuració', profile: 'El meu perfil', species: 'Espècies', credits: 'Informació',
    eyebrow: 'GANDIA · COMUNITAT VALENCIANA', titleA: 'Protegix allò que', titleB: 'ens fa únics.',
    intro: 'Explora Gandia, coneix la seua fauna i respon a avisos de conservació en una aventura sense límits.',
    startRescue: 'Iniciar rescat', rescueDesc: 'Atén avisos, ajuda la fauna i aprén a protegir-la.',
    startExplore: 'Explorar Gandia', exploreDesc: 'Recorre la costa, la ciutat i el Mondúver al teu ritme.',
    continue: 'Continuar partida', online: 'Central operativa en línia', activeAlert: '1 avís prop de tu', menu: 'Menú principal',
    player: 'Rescatadora', level: 'Nivell 08', rescued: 'Rescatats', photos: 'Albiraments', badges: 'Assoliments',
    tip: 'Consell de conservació', tipText: 'Observa sempre la fauna a una distància segura.', compatible: 'Disponible en mòbil i PC', rescueLabel: 'RESCAT', exploreLabel: 'EXPLORACIÓ LLIURE',
    loadingRescue: "Preparant l'equip", loadingExplore: 'Traçant la teua ruta', loadingMap: 'Carregant Gandia',
    fact: 'El Mondúver arriba als 841 m i oferix una de les millors panoràmiques de la Safor.',
    currentCase: 'Avís actiu', boar: 'Porc senglar jove', injured: 'Possible deshidratació', distance: 'A 14 metres', calm: "Acosta't a poc a poc. Evita moviments bruscos.",
    help: "Ajudar l'animal", scan: "Escanejant l'entorn", equipment: 'Equip', food: 'Aliment', care: 'Farmaciola', torch: 'Llanterna', radio: 'Central', compass: 'Brúixola', nearby: 'Avisos pròxims', van: 'Furgoneta', supplies: 'Subministraments', leave: 'Eixir al menú',
    approach: "Protocol d'ajuda", chooseAction: "Tria l'ajuda adequada segons l'estat de l'animal.", hydrate: 'Oferir aigua', treat: 'Aplicar cura', observe: 'Observar', safe: 'Zona segura · sense trànsit pròxim',
    success: 'Rescat completat!', successText: "Has ajudat l'animal de manera segura. Nova fitxa educativa desbloquejada.", viewCard: 'Veure fitxa', close: 'Tancar',
    freeRoute: 'Ruta lliure', gandiaBeach: 'Platja de Gandia', sunset: 'Capvespre · 24 °C', photoMode: 'Mode foto', changeVehicle: 'Canviar vehicle', currentVehicle: 'Vehicle actual', bicycle: 'Bicicleta urbana', speed: 'Velocitat', battery: 'Autonomia', galleryAdded: 'Foto afegida a la teua col·lecció',
    garage: "Garatge d'exploració", chooseVehicle: 'Tria com vols descobrir Gandia', select: 'Seleccionar', selected: 'Seleccionat', car: 'Cotxe elèctric', motorbike: 'Moto', scooter: 'Patinet', bike: 'Bicicleta', vehicleCarDesc: 'Còmode i ràpid per a llargues distàncies.', vehicleMotoDesc: 'Àgil en els vials de la ciutat.', vehicleBikeDesc: 'Ideal per a la costa i els carrils bici.', vehicleScooterDesc: 'Lleuger per a trajectes urbans.',
    audio: 'So', sensitivity: 'Sensibilitat', graphics: 'Qualitat gràfica', automatic: 'Automàtica', language: 'Idioma', controls: 'Controls', high: 'Alta', save: 'Guardar canvis',
    yourProgress: 'El teu progrés', collection: 'Col·lecció educativa', animalsHelped: 'Animals ajudats', places: 'Llocs descoberts', achievements: 'Assoliments obtinguts', recent: 'Assoliment recent', guardian: 'Guardià de la Safor', guardianDesc: 'Completa 10 rescats de fauna local.',
    learn: 'Fauna de la Safor', learnDesc: 'Coneix les espècies que compartixen Gandia amb tu.', common: 'Comú', protected: 'Protegit', cautious: 'Cautelós', urban: 'Urbà', platformMobile: 'Controls tàctils actius', platformDesktop: 'Teclat, ratolí i comandament compatibles',
  },
  en: {
    rescue: 'Rescue mode', explore: 'Explore mode', settings: 'Settings', profile: 'My profile', species: 'Species', credits: 'Information',
    eyebrow: 'GANDÍA · VALENCIAN COMMUNITY', titleA: 'Protect what', titleB: 'makes us unique.',
    intro: 'Explore Gandía, meet its wildlife and respond to conservation alerts in a limitless adventure.',
    startRescue: 'Start rescue', rescueDesc: 'Respond to alerts, help wildlife and learn how to protect it.',
    startExplore: 'Explore Gandía', exploreDesc: 'Discover the coast, city and Mondúver at your own pace.',
    continue: 'Continue game', online: 'Operations centre online', activeAlert: '1 alert near you', menu: 'Main menu', player: 'Rescuer', level: 'Level 08', rescued: 'Rescued', photos: 'Sightings', badges: 'Badges',
    tip: 'Conservation tip', tipText: 'Always observe wildlife from a safe distance.', compatible: 'Available on mobile and PC', rescueLabel: 'RESCUE', exploreLabel: 'FREE EXPLORATION',
    loadingRescue: 'Preparing equipment', loadingExplore: 'Planning your route', loadingMap: 'Loading Gandía', fact: 'Mondúver rises to 841 m and offers one of the finest views in La Safor.',
    currentCase: 'Active alert', boar: 'Young wild boar', injured: 'Possible dehydration', distance: '14 metres away', calm: 'Approach slowly. Avoid sudden movements.', help: 'Help the animal', scan: 'Scanning area', equipment: 'Equipment', food: 'Food', care: 'First aid', torch: 'Torch', radio: 'Control', compass: 'Compass', nearby: 'Nearby alerts', van: 'Rescue van', supplies: 'Supplies', leave: 'Exit to menu',
    approach: 'Care protocol', chooseAction: "Choose the appropriate care for the animal's condition.", hydrate: 'Offer water', treat: 'Apply first aid', observe: 'Observe', safe: 'Safe area · no nearby traffic', success: 'Rescue complete!', successText: 'You helped the animal safely. A new species card has been unlocked.', viewCard: 'View card', close: 'Close',
    freeRoute: 'Free route', gandiaBeach: 'Gandía beach', sunset: 'Sunset · 24 °C', photoMode: 'Photo mode', changeVehicle: 'Change vehicle', currentVehicle: 'Current vehicle', bicycle: 'City bicycle', speed: 'Speed', battery: 'Range', galleryAdded: 'Photo added to your collection',
    garage: 'Exploration garage', chooseVehicle: 'Choose how you want to discover Gandía', select: 'Select', selected: 'Selected', car: 'Electric car', motorbike: 'Motorbike', scooter: 'Scooter', bike: 'Bicycle', vehicleCarDesc: 'Comfortable and fast for longer journeys.', vehicleMotoDesc: 'Agile on city roads.', vehicleBikeDesc: 'Perfect for the coast and cycle paths.', vehicleScooterDesc: 'Lightweight for urban journeys.',
    audio: 'Sound', sensitivity: 'Sensitivity', graphics: 'Graphics quality', automatic: 'Automatic', language: 'Language', controls: 'Controls', high: 'High', save: 'Save changes',
    yourProgress: 'Your progress', collection: 'Learning collection', animalsHelped: 'Animals helped', places: 'Places discovered', achievements: 'Achievements earned', recent: 'Recent achievement', guardian: 'Guardian of La Safor', guardianDesc: 'Complete 10 local wildlife rescues.',
    learn: 'Wildlife of La Safor', learnDesc: 'Meet the species that share Gandía with you.', common: 'Common', protected: 'Protected', cautious: 'Cautious', urban: 'Urban', platformMobile: 'Touch controls active', platformDesktop: 'Keyboard, mouse and controller supported',
  },
};

const languageNames = { es: 'Español', va: 'Valencià', en: 'English' };

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <div className="brand__mark"><Waves size={22} strokeWidth={2.5}/><Mountain size={17} strokeWidth={2.5}/></div>
      <div className="brand__type"><strong>GANDÍA</strong><span>RESCATE & EXPLORACIÓN</span></div>
    </div>
  );
}

function TopNav({ t, language, setLanguage, muted, setMuted, openModal }) {
  const [languageOpen, setLanguageOpen] = useState(false);
  return (
    <header className="topnav">
      <Brand />
      <nav className="topnav__links" aria-label="Navegación principal">
        <button onClick={() => openModal('species')}><BookOpen size={16}/>{t('species')}</button>
        <button onClick={() => openModal('info')}><Info size={16}/>{t('credits')}</button>
      </nav>
      <div className="topnav__actions">
        <button className="icon-button" aria-label="Sonido" onClick={() => setMuted(!muted)}>{muted ? <VolumeX/> : <Volume2/>}</button>
        <div className="language-control">
          <button className="language-button" onClick={() => setLanguageOpen(!languageOpen)} aria-expanded={languageOpen}>
            <Languages size={17}/><span>{language.toUpperCase()}</span><ChevronDown size={14}/>
          </button>
          {languageOpen && <div className="language-menu">
            {Object.entries(languageNames).map(([key, name]) => (
              <button key={key} className={language === key ? 'is-active' : ''} onClick={() => { setLanguage(key); setLanguageOpen(false); }}>
                <span>{name}</span>{language === key && <Check size={15}/>} 
              </button>
            ))}
          </div>}
        </div>
        <button className="icon-button" aria-label={t('settings')} onClick={() => openModal('settings')}><Settings/></button>
        <button className="avatar-button" onClick={() => openModal('profile')} aria-label={t('profile')}><span>LM</span><i/></button>
      </div>
    </header>
  );
}

function PlayerCard({ t, openProfile }) {
  return (
    <aside className="player-card glass-panel">
      <div className="player-card__top">
        <button className="player-identity" onClick={openProfile}>
          <span className="player-avatar"><UserRound size={21}/></span>
          <span><small>{t('player')}</small><strong>Laia Martí</strong></span>
        </button>
        <span className="level-pill">{t('level')}</span>
      </div>
      <div className="progress-track"><span style={{ width: '68%' }}/></div>
      <div className="player-stats">
        <div><strong>12</strong><span>{t('rescued')}</span></div>
        <div><strong>37</strong><span>{t('photos')}</span></div>
        <div><strong>08</strong><span>{t('badges')}</span></div>
      </div>
      <div className="tip-card">
        <span className="tip-icon"><Leaf size={17}/></span>
        <div><strong>{t('tip')}</strong><p>{t('tipText')}</p></div>
      </div>
    </aside>
  );
}

function ModeCard({ mode, t, onStart }) {
  const rescue = mode === 'rescue';
  return (
    <button className={`mode-card mode-card--${mode}`} onClick={() => onStart(mode)}>
      <div className="mode-card__icon">{rescue ? <ShieldCheck size={27}/> : <Compass size={27}/>}</div>
      <div className="mode-card__copy">
        <span>{rescue ? t('rescueLabel') : t('exploreLabel')}</span>
        <h2>{rescue ? t('startRescue') : t('startExplore')}</h2>
        <p>{rescue ? t('rescueDesc') : t('exploreDesc')}</p>
      </div>
      <span className="mode-card__arrow"><ChevronRight/></span>
      {rescue && <span className="alert-dot"><Bell size={12}/>{t('activeAlert')}</span>}
    </button>
  );
}

function MainMenu({ t, language, setLanguage, muted, setMuted, openModal, startMode }) {
  return (
    <main className="menu-screen screen-enter">
      <div className="menu-background" />
      <div className="menu-vignette" />
      <TopNav {...{t, language, setLanguage, muted, setMuted, openModal}} />
      <div className="menu-content">
        <section className="hero-copy">
          <div className="status-line"><span/><Radio size={14}/>{t('online')}</div>
          <div className="eyebrow">{t('eyebrow')}</div>
          <h1>{t('titleA')}<br/><em>{t('titleB')}</em></h1>
          <p>{t('intro')}</p>
          <div className="location-row">
            <span><Sun size={16}/> 24°C</span><span><MapPin size={16}/> Gandía, La Safor</span>
          </div>
        </section>
        <PlayerCard t={t} openProfile={() => openModal('profile')} />
      </div>
      <section className="mode-section">
        <div className="mode-section__heading"><span>{t('menu')}</span><small><Monitor size={14}/><Smartphone size={14}/>{t('compatible')}</small></div>
        <div className="mode-grid">
          <ModeCard mode="rescue" t={t} onStart={startMode}/>
          <ModeCard mode="explore" t={t} onStart={startMode}/>
        </div>
      </section>
      <div className="menu-footer"><span>© GANDÍA NATURA</span><span>39.0007° N · 0.1660° W</span></div>
    </main>
  );
}

function LoadingScreen({ t, mode, progress }) {
  return (
    <main className={`loading-screen loading-screen--${mode}`}>
      <div className="loading-background" />
      <div className="loading-shade" />
      <div className="loading-brand"><Brand/></div>
      <div className="loading-content">
        <div className="loading-orbit"><span/><div>{mode === 'rescue' ? <PawPrint/> : <Compass/>}</div></div>
        <span className="loading-kicker">{mode === 'rescue' ? t('loadingRescue') : t('loadingExplore')}</span>
        <h2>{t('loadingMap')}</h2>
        <div className="loading-progress"><span style={{ width: `${progress}%` }}/></div>
        <div className="loading-meta"><span>{progress}%</span><span>GND-04</span></div>
        <div className="loading-fact"><Leaf size={19}/><p><strong>¿SABÍAS QUE?</strong>{t('fact')}</p></div>
      </div>
    </main>
  );
}

function MiniMap({ rescue = false }) {
  return (
    <div className="minimap">
      <svg viewBox="0 0 220 170" aria-hidden="true">
        <defs>
          <linearGradient id="sea" x1="0" x2="1"><stop stopColor="#21423f"/><stop offset="1" stopColor="#102926"/></linearGradient>
          <filter id="soft"><feGaussianBlur stdDeviation="4"/></filter>
        </defs>
        <path className="map-sea" d="M150,-5 C130,30 166,48 144,77 C123,102 156,132 136,175 L225,175 L225,-5Z"/>
        <path className="map-road main" d="M-10 140 C25 112 47 124 68 91 S118 75 148 42"/>
        <path className="map-road" d="M14 19 C42 43 61 52 91 49 S130 32 154 20"/>
        <path className="map-road" d="M67 0 C72 35 60 58 84 81 S120 112 113 170"/>
        <path className="map-road thin" d="M2 84 C43 70 60 75 86 103 S130 128 155 120"/>
        <path className="map-river" d="M0 118 C38 104 78 130 110 115 S133 94 151 95"/>
        <g className="map-blocks">
          <rect x="22" y="28" width="18" height="12"/><rect x="43" y="34" width="22" height="14"/><rect x="26" y="48" width="29" height="15"/>
          <rect x="92" y="52" width="24" height="15"/><rect x="119" y="45" width="16" height="20"/><rect x="101" y="71" width="28" height="15"/>
          <rect x="24" y="88" width="24" height="18"/><rect x="51" y="92" width="16" height="22"/><rect x="75" y="118" width="24" height="18"/>
        </g>
        <path className="route-line" d={rescue ? 'M52 128 C60 106 88 110 103 91 S128 76 139 61' : 'M55 129 C70 109 98 119 118 96 S140 77 142 48'}/>
      </svg>
      <span className="map-player"><Navigation size={14} fill="currentColor"/></span>
      <span className="map-target"><PawPrint size={12}/></span>
      <span className="map-north">N</span>
    </div>
  );
}

function GameHeader({ t, goMenu, mode, isMobile, gpsPosition }) {
  return (
    <header className="game-header">
      <button className="game-back" onClick={goMenu}><ArrowLeft size={19}/><span>{t('leave')}</span></button>
      <div className="game-location"><span><MapPin size={15}/></span><div><strong>{mode === 'rescue' ? 'Marjal de Gandía' : t('gandiaBeach')}</strong><small>GANDÍA · LA SAFOR</small></div></div>
      <div className="game-status"><span className="status-live"/><span>{isMobile ? `${t('platformMobile')}${gpsPosition ? ' · GPS ±5 m' : ''}` : t('platformDesktop')}</span>{!isMobile && <><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><Gamepad2 size={18}/></>}</div>
    </header>
  );
}

function EquipmentRail({ t, activeTool, setActiveTool }) {
  const tools = [
    { id: 'food', label: t('food'), icon: UtensilsCrossed, count: '3' },
    { id: 'care', label: t('care'), icon: HeartPulse, count: '2' },
    { id: 'torch', label: t('torch'), icon: Zap, count: '' },
    { id: 'radio', label: t('radio'), icon: Radio, count: '1' },
  ];
  return <div className="equipment-rail"><span className="rail-label">{t('equipment')}</span>{tools.map(({id, label, icon: Icon, count}, i) => <button key={id} className={activeTool === id ? 'active' : ''} onClick={() => setActiveTool(id)}><span className="key-hint">{i + 1}</span><Icon size={21}/><small>{label}</small>{count && <i>{count}</i>}</button>)}</div>;
}

function RescueBackdrop({ stream }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
  }, [stream]);
  return <>
    <div className={`rescue-background ${ready ? 'rescue-background--camera' : ''}`} />
    {stream && <video ref={videoRef} className={`rescue-camera ${ready ? 'active' : ''}`} autoPlay muted playsInline onCanPlay={() => setReady(true)} />}
  </>;
}

function RescueMode({ t, goMenu, isMobile, onOpenSpecies, cameraStream, gpsPosition }) {
  const [activeTool, setActiveTool] = useState('food');
  const [carePanel, setCarePanel] = useState(false);
  const [success, setSuccess] = useState(false);
  const [caseOpen, setCaseOpen] = useState(true);
  const complete = () => { setCarePanel(false); setSuccess(true); };
  return (
    <main className="game-screen rescue-game screen-enter">
      <RescueBackdrop stream={cameraStream} />
      <div className="game-vignette" />
      <GameHeader {...{t, goMenu, isMobile, gpsPosition}} mode="rescue"/>
      <div className="compass-bar"><span>NO</span><span>315</span><strong><i/>N</strong><span>30</span><span>NE</span><span>60</span><span>E</span></div>
      <section className={`case-card ${caseOpen ? '' : 'case-card--closed'}`}>
        <button className="case-toggle" onClick={() => setCaseOpen(!caseOpen)}><SirenIcon/><span>{t('currentCase')}</span><ChevronDown size={16}/></button>
        <div className="case-body">
          <div className="animal-avatar"><PawPrint/></div>
          <div className="case-title"><div><h3>{t('boar')}</h3><span><i/>{t('injured')}</span></div><strong>{t('distance')}</strong></div>
          <div className="case-separator"/>
          <p><Info size={15}/>{t('calm')}</p>
        </div>
      </section>
      <div className="world-marker world-marker--animal"><span><PawPrint size={17}/></span><div><strong>{t('boar')}</strong><small>14 m</small></div></div>
      <div className="ar-reticle"><span/><i/><b/><em/></div>
      <div className="scan-label"><Crosshair size={15}/>{t('scan')}<span>•••</span></div>
      <EquipmentRail {...{t, activeTool, setActiveTool}}/>
      <aside className="rescue-map-panel glass-panel"><div className="map-panel-head"><div><span>{t('nearby')}</span><strong>Marjal · Gandía</strong></div><button><Map size={18}/></button></div><MiniMap rescue/><div className="supply-row"><div><CarFront size={19}/><span><strong>{t('van')}</strong><small>{t('supplies')}</small></span></div><span className="supply-dots"><i/><i/><i/><i/><i className="empty"/></span></div></aside>
      <button className="primary-game-action" onClick={() => setCarePanel(true)}><span><HeartPulse size={24}/></span><div><small>{activeTool === 'food' ? t('food') : t('care')}</small><strong>{t('help')}</strong></div><ChevronRight/></button>
      {isMobile && <TouchControls/>}
      {carePanel && <div className="modal-layer modal-layer--game" onMouseDown={() => setCarePanel(false)}>
        <div className="care-sheet" onMouseDown={e => e.stopPropagation()}>
          <button className="close-button" onClick={() => setCarePanel(false)}><X/></button>
          <span className="modal-kicker"><ShieldCheck size={16}/>{t('approach')}</span><h2>{t('boar')}</h2><p>{t('chooseAction')}</p>
          <div className="condition-card"><span className="condition-icon"><Sun/></span><div><strong>{t('injured')}</strong><small>{t('safe')}</small></div><span className="confidence">87%</span></div>
          <div className="care-actions"><button onClick={complete}><span><Waves/></span><strong>{t('hydrate')}</strong><small>Agua · 1 unidad</small></button><button onClick={complete}><span><HeartPulse/></span><strong>{t('treat')}</strong><small>{t('care')} · 1 unidad</small></button><button onClick={() => setCarePanel(false)}><span><Binoculars/></span><strong>{t('observe')}</strong><small>+ 15 XP</small></button></div>
        </div>
      </div>}
      {success && <div className="success-toast"><span className="success-icon"><Check/></span><div><strong>{t('success')}</strong><p>{t('successText')}</p><button onClick={() => { setSuccess(false); onOpenSpecies(); }}>{t('viewCard')}<ChevronRight size={15}/></button></div><button onClick={() => setSuccess(false)}><X size={18}/></button></div>}
    </main>
  );
}

function SirenIcon() { return <span className="siren-icon"><Bell size={14}/><i/></span>; }

function TouchControls() {
  return <><div className="touch-stick"><span><i/></span></div><button className="touch-look"><RotateCcw size={21}/></button></>;
}

const vehicles = [
  { id: 'car', icon: CarFront, speed: '110 km/h', range: '280 km' },
  { id: 'motorbike', icon: Navigation, speed: '90 km/h', range: '160 km', descKey: 'vehicleMotoDesc' },
  { id: 'bike', icon: Bike, speed: '28 km/h', range: '∞' },
  { id: 'scooter', icon: Zap, speed: '25 km/h', range: '34 km' },
];

function VehicleGarage({ t, current, setCurrent, close }) {
  return <div className="modal-layer modal-layer--game" onMouseDown={close}><div className="garage-modal" onMouseDown={e => e.stopPropagation()}><button className="close-button" onClick={close}><X/></button><span className="modal-kicker"><CircleParking size={16}/>{t('garage')}</span><h2>{t('chooseVehicle')}</h2><div className="vehicle-grid">{vehicles.map(vehicle => { const Icon = vehicle.icon; const active = current === vehicle.id; return <button key={vehicle.id} className={active ? 'active' : ''} onClick={() => setCurrent(vehicle.id)}><span className="vehicle-icon"><Icon/></span><span className="vehicle-name"><strong>{t(vehicle.id)}</strong><small>{t(vehicle.descKey || `vehicle${vehicle.id.charAt(0).toUpperCase()+vehicle.id.slice(1)}Desc`)}</small></span><span className="vehicle-spec"><i><Gauge size={14}/>{vehicle.speed}</i><i><BatteryMedium size={14}/>{vehicle.range}</i></span><b>{active ? <><Check size={16}/>{t('selected')}</> : <>{t('select')}<ChevronRight size={16}/></>}</b></button>})}</div></div></div>;
}

function ExploreMode({ t, goMenu, isMobile }) {
  const [garage, setGarage] = useState(false);
  const [vehicle, setVehicle] = useState('bike');
  const [photoToast, setPhotoToast] = useState(false);
  const current = vehicles.find(v => v.id === vehicle);
  const VehicleIcon = current.icon;
  const takePhoto = () => { setPhotoToast(true); window.setTimeout(() => setPhotoToast(false), 2300); };
  return <main className="game-screen explore-game screen-enter">
    <div className="explore-background"/><div className="game-vignette explore-vignette"/>
    <GameHeader {...{t, goMenu, isMobile}} mode="explore"/>
    <div className="compass-bar"><span>O</span><span>285</span><strong><i/>NO</strong><span>330</span><span>N</span><span>30</span><span>NE</span></div>
    <div className="explore-title"><span><Compass size={17}/>{t('freeRoute')}</span><h1>{t('gandiaBeach')}</h1><p><Sun size={17}/>{t('sunset')}</p></div>
    <div className="landmark-marker landmark-marker--port"><span/><div><strong>Port de Gandia</strong><small>1,2 km</small></div></div>
    <div className="landmark-marker landmark-marker--mount"><span/><div><strong>Montdúver</strong><small>18,6 km</small></div></div>
    <aside className="explore-map-panel glass-panel"><MiniMap/><div className="route-stat"><Navigation size={17}/><span><strong>Passeig Marítim</strong><small>Ruta costera · 4,2 km</small></span><ChevronRight size={17}/></div></aside>
    <section className="vehicle-hud glass-panel"><div className="vehicle-hud__top"><span className="vehicle-round"><VehicleIcon/></span><div><small>{t('currentVehicle')}</small><strong>{t(vehicle)}</strong></div><button onClick={() => setGarage(true)}><SlidersHorizontal size={18}/>{t('changeVehicle')}</button></div><div className="vehicle-metrics"><div><Gauge/><span><strong>18</strong><small>km/h · {t('speed')}</small></span></div><div><BatteryMedium/><span><strong>{vehicle === 'bike' ? '∞' : '82%'}</strong><small>{t('battery')}</small></span></div></div></section>
    <button className="photo-action" onClick={takePhoto}><span><Camera/></span><div><small>FOTOGRAFÍA</small><strong>{t('photoMode')}</strong></div></button>
    <div className="quick-actions"><button onClick={() => setGarage(true)}><Bike/><span>{t('changeVehicle')}</span></button><button><Map/><span>Mapa</span></button><button><Backpack/><span>{t('equipment')}</span></button></div>
    {isMobile && <TouchControls/>}
    {garage && <VehicleGarage t={t} current={vehicle} setCurrent={setVehicle} close={() => setGarage(false)}/>} 
    {photoToast && <div className="photo-toast"><Check/><span>{t('galleryAdded')}</span><ImageIcon/></div>}
  </main>;
}

function SettingsModal({ t, language, setLanguage, muted, setMuted, close }) {
  const [sensitivity, setSensitivity] = useState(64);
  return <ModalShell close={close} title={t('settings')} icon={Settings}>
    <div className="setting-list">
      <div className="setting-row"><span className="setting-row__icon"><Volume2/></span><div><strong>{t('audio')}</strong><small>Música y efectos ambientales</small></div><button className={`toggle ${!muted ? 'on' : ''}`} onClick={() => setMuted(!muted)}><i/></button></div>
      <div className="setting-row setting-row--select"><span className="setting-row__icon"><Languages/></span><div><strong>{t('language')}</strong><small>Interfaz y diálogos</small></div><select value={language} onChange={e => setLanguage(e.target.value)}>{Object.entries(languageNames).map(([key, val]) => <option key={key} value={key}>{val}</option>)}</select></div>
      <div className="setting-row setting-row--range"><span className="setting-row__icon"><SlidersHorizontal/></span><div><strong>{t('sensitivity')}</strong><small>{t('controls')}</small></div><span>{sensitivity}%</span><input type="range" min="20" max="100" value={sensitivity} onChange={e => setSensitivity(e.target.value)}/></div>
      <div className="setting-row setting-row--select"><span className="setting-row__icon"><Monitor/></span><div><strong>{t('graphics')}</strong><small>{t('automatic')}</small></div><select defaultValue="high"><option value="high">{t('high')}</option><option>Media</option><option>Baja</option></select></div>
    </div><button className="modal-primary" onClick={close}><Check size={18}/>{t('save')}</button>
  </ModalShell>;
}

function ProfileModal({ t, close }) {
  return <ModalShell close={close} title={t('yourProgress')} icon={UserRound} wide>
    <div className="profile-hero"><span className="profile-big-avatar">LM<i/></span><div><span>{t('level')}</span><h2>Laia Martí</h2><p>Guardiana local · Gandía</p><div className="profile-xp"><span><i/></span><small>2.430 / 3.000 XP</small></div></div></div>
    <div className="profile-stat-grid"><div><PawPrint/><strong>12</strong><span>{t('animalsHelped')}</span></div><div><MapPin/><strong>19</strong><span>{t('places')}</span></div><div><Trophy/><strong>08</strong><span>{t('achievements')}</span></div><div><BookOpen/><strong>14</strong><span>{t('collection')}</span></div></div>
    <div className="achievement-card"><span><Award/></span><div><small>{t('recent')}</small><strong>{t('guardian')}</strong><p>{t('guardianDesc')}</p></div><b>10 / 10</b></div>
  </ModalShell>;
}

function SpeciesModal({ t, close }) {
  const species = [
    { icon: PawPrint, title: 'Jabalí', latin: 'Sus scrofa', tags: [t('common'), t('cautious')], className: 'boar' },
    { icon: Cat, title: 'Gato doméstico', latin: 'Felis catus', tags: [t('common'), t('urban')], className: 'cat' },
    { icon: Bird, title: 'Paloma bravía', latin: 'Columba livia', tags: [t('common'), t('urban')], className: 'bird' },
    { icon: Rabbit, title: 'Erizo europeo', latin: 'Erinaceus europaeus', tags: [t('protected'), t('cautious')], className: 'hedgehog' },
  ];
  return <ModalShell close={close} title={t('learn')} icon={BookOpen} wide><p className="modal-intro">{t('learnDesc')}</p><div className="species-grid">{species.map(({icon: Icon, title, latin, tags, className}) => <article key={title} className={`species-card species-card--${className}`}><div className="species-art"><div/><Icon/></div><div className="species-copy"><h3>{title}</h3><em>{latin}</em><p>{tags.map(tag => <span key={tag}>{tag}</span>)}</p></div><button><ChevronRight/></button></article>)}</div><div className="species-foot"><Leaf/><span>Información educativa basada en fauna de la Comunitat Valenciana.</span></div></ModalShell>;
}

function InfoModal({ t, close }) {
  return <ModalShell close={close} title="Gandía Natura" icon={Leaf} wide><div className="info-hero"><div><Waves/><Mountain/></div><span>CONSERVACIÓN · EDUCACIÓN · EXPLORACIÓN</span><h2>Conocer para proteger.</h2><p>Una experiencia educativa ambientada en Gandía que acerca la fauna y los paisajes de La Safor a todas las personas.</p></div><div className="info-columns"><div><strong>Experiencia responsable</strong><p>El juego promueve la observación a distancia y la intervención segura, nunca la captura o el contacto forzado.</p></div><div><strong>Una Gandía viva</strong><p>Playa, marjal, huerta, ciudad y montaña conviven en un territorio de enorme diversidad.</p></div></div><div className="credits-row"><span>Diseñado con respeto por la fauna local</span><span>VERSIÓN 1.0 · 2026</span></div></ModalShell>;
}

function ModalShell({ close, title, icon: Icon, children, wide = false }) {
  return <div className="modal-layer" onMouseDown={close}><section className={`app-modal ${wide ? 'app-modal--wide' : ''}`} onMouseDown={e => e.stopPropagation()}><header><span><Icon/></span><h2>{title}</h2><button className="close-button" onClick={close}><X/></button></header><div className="app-modal__body">{children}</div></section></div>;
}

function App() {
  const [language, setLanguageState] = useState(() => localStorage.getItem('gandia-language') || 'es');
  const [screen, setScreen] = useState('menu');
  const [loadingMode, setLoadingMode] = useState('rescue');
  const [progress, setProgress] = useState(0);
  const [modal, setModal] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [gpsPosition, setGpsPosition] = useState(null);
  const geoWatch = useRef(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px), (pointer: coarse)').matches);
  const t = useMemo(() => (key) => copy[language]?.[key] ?? copy.es[key] ?? key, [language]);
  const setLanguage = (lang) => { setLanguageState(lang); localStorage.setItem('gandia-language', lang); document.documentElement.lang = lang === 'va' ? 'ca' : lang; };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px), (pointer: coarse)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (screen !== 'loading') return;
    setProgress(4);
    const started = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - started;
      const next = Math.min(100, Math.round(4 + (elapsed / 1800) * 96));
      setProgress(next);
      if (next >= 100) {
        window.clearInterval(interval);
        window.setTimeout(() => setScreen(loadingMode), 180);
      }
    }, 45);
    return () => window.clearInterval(interval);
  }, [screen, loadingMode]);

  const stopSensors = () => {
    cameraStream?.getTracks().forEach(track => track.stop());
    setCameraStream(null);
    if (geoWatch.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatch.current);
    geoWatch.current = null;
    setGpsPosition(null);
  };
  const startMode = (mode) => {
    setLoadingMode(mode);
    setScreen('loading');
    if (mode !== 'rescue' || !isMobile) return;
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        .then(setCameraStream)
        .catch(() => setCameraStream(null));
    }
    if (navigator.geolocation) {
      geoWatch.current = navigator.geolocation.watchPosition(
        ({ coords }) => setGpsPosition({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
        () => setGpsPosition(null),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
      );
    }
  };
  const goMenu = () => { stopSensors(); setScreen('menu'); };
  return <div className="app-shell">
    {screen === 'menu' && <MainMenu {...{t, language, setLanguage, muted, setMuted}} openModal={setModal} startMode={startMode}/>} 
    {screen === 'loading' && <LoadingScreen t={t} mode={loadingMode} progress={progress}/>} 
    {screen === 'rescue' && <RescueMode {...{t, goMenu, isMobile, cameraStream, gpsPosition}} onOpenSpecies={() => setModal('species')}/>} 
    {screen === 'explore' && <ExploreMode {...{t, goMenu, isMobile}}/>}
    {modal === 'settings' && <SettingsModal {...{t, language, setLanguage, muted, setMuted}} close={() => setModal(null)}/>} 
    {modal === 'profile' && <ProfileModal t={t} close={() => setModal(null)}/>} 
    {modal === 'species' && <SpeciesModal t={t} close={() => setModal(null)}/>} 
    {modal === 'info' && <InfoModal t={t} close={() => setModal(null)}/>} 
  </div>;
}

export default App;
