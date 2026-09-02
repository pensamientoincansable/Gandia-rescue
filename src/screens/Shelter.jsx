import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Hammer, Home, Lock, Moon, PawPrint, Sparkles, Sun, Sunset, Trash2, X } from 'lucide-react';
import {
  GROUNDS, GRID_BIG, GRID_BIG_LEVEL, GRID_BASE, SKIES, SPECIES, SHELTER_ITEMS,
  groundUnlocked, itemUnlocked, levelForXp, levelProgress,
} from '../lib/game.js';
import { SHELTER_TEXTURES, SHELTER_TREE_SPRITES, VEGETATION_ASSETS } from '../three/WorldAssets.js';
import { Toast, XpBar } from '../components/common.jsx';

/* ================================================================== */
/* Sprites 2.5D (billboards con sombra sobre losetas isométricas)      */
/* ================================================================== */

const Cabana = () => (
  <g>
    <path d="M-26 -6 L0 8 L0 46 L-26 32 Z" fill="#e8d3ac" />
    <path d="M26 -6 L0 8 L0 46 L26 32 Z" fill="#d9bf94" />
    <path d="M-30 -4 L0 -34 L30 -4 L26 6 L0 -22 L-26 6 Z" fill="#c96a48" />
    <path d="M-26 6 L0 -22 L26 6 L26 12 L0 -14 L-26 12 Z" fill="#b55a3c" />
    <path d="M-26 6 L0 -14 L26 6 L26 10 L0 -10 L-26 10 Z" fill="#a34e33" opacity=".55" />
    <rect x="-7" y="16" width="14" height="22" rx="6" fill="#8a5a3b" />
    <circle cx="4.4" cy="27" r="1.3" fill="#f0d9a8" />
    <rect x="12" y="12" width="10" height="10" rx="2" fill="#bfe3ea" stroke="#8a5a3b" strokeWidth="1.6" />
    <path d="M-24 20 c-1.8-2 -0.5-4.6 2-4.6 1.4 0 2 0.8 2 0.8 s0.6-0.8 2-0.8 c2.5 0 3.8 2.6 2 4.6 l-4 4.4 Z" fill="#e2604f" transform="translate(-30 2)" />
  </g>
);

const Comedero = () => (
  <g>
    <ellipse cx="0" cy="16" rx="15" ry="6" fill="#8a5a3b" />
    <path d="M-15 12 a15 6 0 0 0 30 0 l-3 8 a12 5 0 0 1 -24 0 Z" fill="#a06a45" />
    <ellipse cx="0" cy="12" rx="12" ry="4.6" fill="#7c4f31" />
    <ellipse cx="0" cy="11.4" rx="9.5" ry="3.4" fill="#e8b45f" />
    <circle cx="-3" cy="10.8" r="1.2" fill="#c98d3f" />
    <circle cx="3" cy="11.6" r="1.2" fill="#c98d3f" />
  </g>
);

const Valla = () => (
  <g>
    <rect x="-20" y="-18" width="6" height="34" rx="3" fill="#c99e6a" />
    <rect x="14" y="-18" width="6" height="34" rx="3" fill="#b98f5c" />
    <rect x="-26" y="-10" width="52" height="6" rx="3" fill="#d9b078" />
    <rect x="-26" y="2" width="52" height="6" rx="3" fill="#c99e6a" />
  </g>
);

const Bebedero = () => (
  <g>
    <ellipse cx="0" cy="14" rx="16" ry="6.5" fill="#7e93a8" />
    <ellipse cx="0" cy="12" rx="13" ry="5" fill="#bfe3ea" />
    <ellipse cx="-3" cy="11" rx="5" ry="1.8" fill="#e9f7fa" opacity=".8" />
  </g>
);

/* Los PNG de los FBX son atlas: la columna izquierda contiene piezas de
   material para el modelo 3D. El viewBox toma sólo la silueta completa de la
   derecha, evitando mostrar esa columna como un tronco suelto en el refugio. */
const FoliageAtlas = ({ src, x, y, width, height }) => (
  <svg
    className="shelter-textured-foliage"
    x={x} y={y} width={width} height={height}
    viewBox="34 0 94 128"
    preserveAspectRatio="xMidYMax meet"
    overflow="hidden"
  >
    <image href={src} width="128" height="128" />
  </svg>
);

const Arbusto = () => (
  <g>
    {/* Atlas PNG del arbusto y modelo FBX de media: da detalle orgánico sin
        recurrir a círculos genéricos en el constructor del refugio. */}
    <FoliageAtlas src={VEGETATION_ASSETS.bushFlower.textureUrl} x="-29" y="-28" width="58" height="54" />
    <circle cx="-8" cy="-2" r="1.55" fill="#e2604f" />
    <circle cx="8" cy="1" r="1.55" fill="#e2604f" />
  </g>
);

const Naranjo = () => (
  <g>
    {/* La copa texturizada mantiene el guiño de naranjo con frutos encima. */}
    <FoliageAtlas src={VEGETATION_ASSETS.citrus.textureUrl} x="-36" y="-52" width="72" height="78" />
    <circle cx="-10" cy="-17" r="2.6" fill="#f0a13c" />
    <circle cx="7" cy="-22" r="2.6" fill="#f0a13c" />
    <circle cx="12" cy="-9" r="2.6" fill="#f0a13c" />
    <circle cx="-2" cy="-7" r="2.6" fill="#f0a13c" />
  </g>
);

const Camino = () => (
  <g>
    <path d="M0 -16 L26 0 L0 16 L-26 0 Z" fill="#cbbfa4" />
    <path d="M0 -10 L16 0 L0 10 L-16 0 Z" fill="#ded3b8" />
    <path d="M0 -4 L6 0 L0 4 L-6 0 Z" fill="#efe6cf" />
  </g>
);

const Cajanido = () => (
  <g>
    <rect x="-3" y="2" width="7" height="22" fill="#8a5a3b" />
    <rect x="-12" y="-22" width="24" height="26" rx="3" fill="#c99e6a" />
    <path d="M-14 -22 L0 -34 L14 -22 Z" fill="#a9784b" />
    <circle cx="0" cy="-12" r="5" fill="#4a2f1d" />
    <path d="M6 0 l8 3 -8 3 Z" fill="#8a5a3b" />
  </g>
);

const Charca = () => (
  <g>
    <path d="M0 -20 L38 0 L0 20 L-38 0 Z" fill="#8fbf9a" />
    <path d="M0 -15 L30 0 L0 15 L-30 0 Z" fill="#7fc3c9" />
    <path d="M0 -10 L20 0 L0 10 L-20 0 Z" fill="#8fd0d6" />
    <ellipse cx="-8" cy="-2" rx="6" ry="2" fill="#c3ecec" opacity=".85" />
    <path d="M26 -6 c2-6 1-9 0-11 M30 -4 c3-5 3-9 2-12" stroke="#548f4c" strokeWidth="2" fill="none" strokeLinecap="round" />
  </g>
);

const Flores = () => (
  <g>
    <path d="M-12 20 C-11 10 -12 4 -13 0 M2 22 C3 12 2 6 3 2 M14 20 C14 12 15 8 16 4" stroke="#548f4c" strokeWidth="2" fill="none" strokeLinecap="round" />
    {[[ -13, -4, '#e2604f'], [3, -3, '#f0a13c'], [16, 0, '#b78ac1'], [-4, 6, '#f3d05e']].map(([x, y, c], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="0" cy="-4" rx="2.6" ry="4" fill={c} transform={`rotate(${a})`} />)}
        <circle r="2.4" fill="#fdf3d8" />
      </g>
    ))}
  </g>
);

const Farol = () => (
  <g>
    <rect x="-2" y="-2" width="5" height="26" rx="2" fill="#5d6b74" />
    <path d="M-9 -14 L9 -14 L6 2 L-6 2 Z" fill="#3f4c55" />
    <rect x="-5" y="-11" width="10" height="10" rx="2" className="farol-glass" fill="#ffd98a" />
    <path d="M-7 -14 L0 -22 L7 -14 Z" fill="#5d6b74" />
    <circle className="farol-glow" cx="0" cy="-6" r="14" fill="#ffd98a" opacity="0" />
  </g>
);

const Palmera = () => (
  <g>
    <path d="M-2 26 C0 12 2 2 8 -10 L12 -8 C6 4 5 14 4 26 Z" fill="#9a7048" />
    {[-160, -120, -70, -20, 20, 60].map((a, i) => (
      <ellipse key={i} cx="10" cy="-12" rx="13" ry="4.6" fill={i % 2 ? '#5f9e56' : '#6cab60'} transform={`rotate(${a} 10 -12)`} />
    ))}
    <circle cx="10" cy="-10" r="3" fill="#8a5a3b" />
  </g>
);

const Sombra = () => (
  <g>
    <rect x="16" y="-4" width="5" height="30" rx="2" fill="#5d6b74" />
    <rect x="-24" y="6" width="5" height="20" rx="2" fill="#5d6b74" />
    <path d="M-30 8 L18 -6 L20 2 L-28 16 Z" fill="#e2604f" />
    <path d="M-30 8 L18 -6 L18 -4 L-30 10 Z" fill="#c94f3f" />
  </g>
);

const Fuente = () => (
  <g>
    <ellipse cx="0" cy="16" rx="18" ry="7" fill="#b8c4c9" />
    <ellipse cx="0" cy="13" rx="14" ry="5" fill="#8fd0d6" />
    <rect x="-4" y="0" width="8" height="10" rx="2" fill="#cdd8dc" />
    <ellipse cx="0" cy="0" rx="7" ry="3" fill="#b8c4c9" />
    <path d="M0 -2 C-1 -8 -6 -8 -6 -4 M0 -2 C1 -8 6 -8 6 -4" stroke="#a9dde2" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <circle cx="0" cy="-4" r="2" fill="#c3ecec" />
  </g>
);

const SPRITES = {
  cabana: Cabana, comedero: Comedero, valla: Valla, bebedero: Bebedero, arbusto: Arbusto,
  naranjo: Naranjo, camino: Camino, cajanido: Cajanido, charca: Charca, flores: Flores,
  farol: Farol, palmera: Palmera, sombra: Sombra, fuente: Fuente,
};

const FLAT_ITEMS = new Set(['camino', 'charca']);

export function ShelterItemSprite({ id }) {
  const S = SPRITES[id];
  return S ? <S /> : null;
}

/* ================================================================== */
/* Fauna visitante (sprites sencillos y adorables)                     */
/* ================================================================== */

const ANIMAL_SPRITES = {
  erizo: () => (
    <g>
      <path d="M-10 6 L-8 -6 L-5 0 L-4 -8 L-1 -1 L2 -8 L4 0 L7 -5 L8 2 L10 6 Z" fill="#7a5334" />
      <ellipse cx="6" cy="7" rx="7.5" ry="5.5" fill="#c99e6a" />
      <circle cx="9.4" cy="5.4" r="1" fill="#2f2418" />
      <circle cx="4.6" cy="5.4" r="1" fill="#2f2418" />
      <circle cx="13" cy="7" r="1.5" fill="#5c3f27" />
    </g>
  ),
  paloma: () => (
    <g>
      <ellipse cx="0" cy="4" rx="9" ry="6.5" fill="#9aa7b5" />
      <circle cx="7" cy="-3" r="4.5" fill="#8b98a6" />
      <path d="M11 -3 l4 1.6 -4 1.6 Z" fill="#f0a13c" />
      <circle cx="8.4" cy="-4" r="1" fill="#25313d" />
      <path d="M-8 4 C-12 2 -13 5 -10 7" stroke="#8b98a6" strokeWidth="2" fill="none" />
      <path d="M-2 10 l-1.6 4 M2 10 l1.6 4" stroke="#c96a48" strokeWidth="1.6" />
    </g>
  ),
  gato: () => (
    <g>
      <ellipse cx="0" cy="5" rx="10" ry="6" fill="#e8964f" />
      <circle cx="8" cy="-4" r="5.5" fill="#ef9f5b" />
      <path d="M4 -8 l1 -4 3 2.6 Z M12 -8 l-1 -4 -3 2.6 Z" fill="#ef9f5b" />
      <circle cx="6.6" cy="-5" r="1" fill="#33251a" />
      <circle cx="9.8" cy="-5" r="1" fill="#33251a" />
      <path d="M11 -2.4 c1.4 0 1.4 1.4 0 1.4" stroke="#b3662f" strokeWidth="1" fill="none" />
      <path d="M-10 4 C-15 6 -15 -2 -11 -2" stroke="#e8964f" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  jabali: () => (
    <g>
      <ellipse cx="0" cy="4" rx="12" ry="7.5" fill="#6b4a2e" />
      <path d="M-12 4 a12 7.5 0 0 1 6 -6.4 M-8 -3 l-2 -4 4 1 Z" fill="#7a5535" />
      <ellipse cx="12" cy="5" rx="5" ry="4" fill="#54391f" />
      <circle cx="14.6" cy="3.6" r="1" fill="#20150c" />
      <path d="M15 7 l3 1 -3 1.4 Z" fill="#f3ead9" />
      <path d="M-8 11 l-1.4 3 M4 11 l1.4 3" stroke="#4a2f1d" strokeWidth="1.8" />
    </g>
  ),
  conejo: () => (
    <g>
      <ellipse cx="0" cy="6" rx="8.5" ry="6" fill="#d9c8b4" />
      <circle cx="6" cy="-1" r="5" fill="#e5d7c5" />
      <path d="M3.4 -5 C2 -12 5 -13 5.6 -7 Z M8.4 -5 C10 -12 7 -13 6.6 -7 Z" fill="#e5d7c5" />
      <circle cx="4.6" cy="-2" r="0.9" fill="#33251a" />
      <circle cx="7.8" cy="-2" r="0.9" fill="#33251a" />
      <circle cx="6.2" cy="0" r="1.1" fill="#d98a80" />
      <circle cx="-6" cy="8" r="2.6" fill="#f2e8da" />
    </g>
  ),
  mochuelo: () => (
    <g>
      <ellipse cx="0" cy="0" rx="8" ry="9" fill="#a9825a" />
      <circle cx="-3.2" cy="-2.4" r="3.2" fill="#f3ead9" />
      <circle cx="3.2" cy="-2.4" r="3.2" fill="#f3ead9" />
      <circle cx="-3.2" cy="-2.4" r="1.4" fill="#2f2418" />
      <circle cx="3.2" cy="-2.4" r="1.4" fill="#2f2418" />
      <path d="M-1.4 -0.4 l1.4 1.8 1.4 -1.8 Z" fill="#f0a13c" />
      <path d="M-8 -6 l2 -3 2 2 M8 -6 l-2 -3 -2 2" fill="#8f6c46" />
      <path d="M-5 6 c1.6 1.6 8.4 1.6 10 0 l-1 3 c-2.4 1.2 -5.6 1.2 -8 0 Z" fill="#c9a06a" />
    </g>
  ),
  gavina: () => (
    <g>
      <ellipse cx="0" cy="4" rx="9.5" ry="6.5" fill="#eef1f2" />
      <path d="M-9 4 C-13 1 -14 6 -10 8" stroke="#d7dcde" strokeWidth="2.4" fill="none" />
      <circle cx="7" cy="-3" r="4.6" fill="#f6f8f8" />
      <path d="M11 -3.4 l4.4 1.8 -4.4 1.6 Z" fill="#f0c53c" />
      <circle cx="8.2" cy="-4.2" r="1" fill="#25313d" />
      <path d="M-4 -2 c2 -3 6 -3 8 0" stroke="#d7dcde" strokeWidth="2" fill="none" />
      <path d="M-2 10 l-1.6 4 M2 10 l1.6 4" stroke="#f0a13c" strokeWidth="1.6" />
    </g>
  ),
  garza: () => (
    <g>
      <ellipse cx="0" cy="4" rx="7" ry="5.5" fill="#b9c6cf" />
      <path d="M2 0 C4 -8 4 -12 3 -16 l-4 0 c-1 4 0 10 -1 14 Z" fill="#cdd8de" />
      <circle cx="1" cy="-17" r="3.4" fill="#e6edf1" />
      <path d="M4 -17 l6 1.6 -6 1.6 Z" fill="#f0a13c" />
      <circle cx="1.8" cy="-18" r="0.9" fill="#25313d" />
      <path d="M-2 9 l0 6 M2 9 l0 6 M-4 15 l4 -1 M1 15 l4 -1" stroke="#5d6b74" strokeWidth="1.4" />
    </g>
  ),
};

const ANIMAL_SCALE = 1.15;

/* ================================================================== */
/* Proyección isométrica                                               */
/* ================================================================== */
const TILE_W = 88;
const TILE_H = 44;
const iso = (x, y) => ({ sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) });

const GROUND_COLORS = {
  hierba:  { a: '#9ccf7a', b: '#93c771', edge: '#7fb35f' },
  arena:   { a: '#ecd9a8', b: '#e3cf9a', edge: '#cdb684' },
  tierra:  { a: '#c98d5f', b: '#c08355', edge: '#a86f45' },
};

/* ================================================================== */
/* Escenario                                                           */
/* ================================================================== */
export default function Shelter({
  t, goMenu, save, actions, notify, onOpenSpecies,
}) {
  const level = levelForXp(save.xp);
  const { placed, ground, sky } = save.shelter;
  const grid = level >= GRID_BIG_LEVEL ? GRID_BIG : GRID_BASE;

  const [tab, setTab] = useState('build');
  const [buildItem, setBuildItem] = useState(null);
  const [removeMode, setRemoveMode] = useState(false);
  const [toast, setToast] = useState(null);
  const stageRef = useRef(null);

  const say = (text, tone = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2400);
  };

  const occupied = useMemo(() => {
    const map = new Map();
    for (const p of placed) map.set(`${p.x},${p.y}`, p);
    return map;
  }, [placed]);

  /* Fauna presente según lo construido */
  const presentSpecies = useMemo(() => {
    const ids = new Set(placed.map((p) => p.item));
    return SPECIES.filter((s) => (s.need.any
      ? s.need.any.some((i) => ids.has(i))
      : s.need.all.every((i) => ids.has(i))));
  }, [placed]);

  /* Posiciones errantes de la fauna */
  const [animalPos, setAnimalPos] = useState({});
  const freeTiles = useMemo(() => {
    const tiles = [];
    for (let x = 0; x < grid; x += 1) {
      for (let y = 0; y < grid; y += 1) {
        if (!occupied.has(`${x},${y}`)) tiles.push({ x, y });
      }
    }
    return tiles;
  }, [occupied, grid]);

  useEffect(() => {
    setAnimalPos((prev) => {
      const next = { ...prev };
      for (const sp of presentSpecies) {
        if (!next[sp.id] || next[sp.id].x >= grid) {
          const tile = freeTiles[Math.floor(Math.random() * freeTiles.length)] ?? { x: grid >> 1, y: grid >> 1 };
          next[sp.id] = { x: tile.x, y: tile.y, flip: false };
        }
      }
      for (const id of Object.keys(next)) {
        if (!presentSpecies.some((s) => s.id === id)) delete next[id];
      }
      return next;
    });
  }, [presentSpecies, freeTiles, grid]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setAnimalPos((prev) => {
        const next = { ...prev };
        for (const sp of presentSpecies) {
          if (Math.random() < 0.55 && freeTiles.length) {
            const tile = freeTiles[Math.floor(Math.random() * freeTiles.length)];
            const cur = next[sp.id] ?? tile;
            next[sp.id] = { x: tile.x, y: tile.y, flip: (tile.x + tile.y) < (cur.x + cur.y) };
          }
        }
        return next;
      });
    }, 4200);
    return () => window.clearInterval(interval);
  }, [presentSpecies, freeTiles]);

  /* Aviso de primera visita de cada especie */
  useEffect(() => {
    for (const sp of presentSpecies) {
      if (!save.shelter.met.includes(sp.id)) {
        actions.markAnimalMet(sp.id);
        say(`${sp.emoji} ${t(`sp_${sp.id}`)} ${t('firstVisit')}`);
      }
    }
  }, [presentSpecies]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = (x, y) => {
    if (removeMode) return;
    if (!buildItem) return;
    if (!itemUnlocked(buildItem, level)) return;
    if (occupied.has(`${x},${y}`)) { say(t('occupiedHint'), 'warn'); return; }
    actions.placeShelterItem(buildItem, x, y);
    if ((SHELTER_ITEMS.find((i) => i.id === buildItem)?.level ?? 1) >= 4) say(`✓ ${t(`it_${buildItem}`)}`);
  };

  const boardW = grid * TILE_W + 200;
  const boardH = grid * TILE_H + 340;
  const ox = boardW / 2;
  const oy = 150;

  /* Parallax sutil con el puntero para dar profundidad 2.5D */
  const onStageMove = (e) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.setProperty('--px', px.toFixed(3));
    el.style.setProperty('--py', py.toFixed(3));
  };

  const tiles = [];
  for (let x = 0; x < grid; x += 1) {
    for (let y = 0; y < grid; y += 1) tiles.push({ x, y });
  }

  const sortedItems = [...placed].sort((a, b) => (a.x + a.y) - (b.x + b.y));

  const animalsRender = presentSpecies.map((sp) => {
    const pos = animalPos[sp.id];
    if (!pos) return null;
    const { sx, sy } = iso(pos.x, pos.y);
    const S = ANIMAL_SPRITES[sp.id];
    return (
      <g
        key={sp.id}
        className="shelter-animal"
        style={{ transform: `translate(${ox + sx}px, ${oy + sy - 14}px) scaleX(${pos.flip ? -ANIMAL_SCALE : ANIMAL_SCALE}) scaleY(${ANIMAL_SCALE})` }}
      >
        <ellipse cx="0" cy="10" rx="12" ry="4" fill="rgba(20,40,25,.18)" />
        <S />
      </g>
    );
  });

  const groundColors = GROUND_COLORS[ground] ?? GROUND_COLORS.hierba;
  const groundTexture = SHELTER_TEXTURES.ground[ground] ?? SHELTER_TEXTURES.ground.hierba;
  const skyTexture = SHELTER_TEXTURES.sky[sky] ?? SHELTER_TEXTURES.sky.dia;

  return (
    <main className={`game-screen shelter-screen screen-enter sky-${sky} ground-${ground}`}>
      <div
        className="shelter-stage"
        ref={stageRef}
        onMouseMove={onStageMove}
        style={{ '--shelter-sky-texture': `url("${skyTexture}")` }}
      >
        <div className="shelter-sky">
          <span className="shelter-sun" />
          {sky === 'noche' && [...Array(14)].map((_, i) => <i key={i} className="shelter-star" style={{ left: `${(i * 67) % 96}%`, top: `${(i * 37) % 55}%`, animationDelay: `${(i % 5) * 0.6}s` }} />)}
          <span className="shelter-cloud c1" /><span className="shelter-cloud c2" /><span className="shelter-cloud c3" />
        </div>
        {/* Árboles detallados de los atlas subidos: decoran el horizonte del
            refugio sin ocupar casillas construibles ni repetir copas-círculo. */}
        <div className="shelter-vegetation-backdrop" aria-hidden="true">
          {SHELTER_TREE_SPRITES.map((src, index) => (
            <span key={src} className={`shelter-backdrop-tree tree-${index + 1}`}>
              <img src={src} alt="" />
            </span>
          ))}
        </div>
        <svg className="shelter-hills" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <path d="M0 300 L0 190 C150 120 260 210 420 150 C580 92 700 190 880 140 C1020 100 1120 180 1200 150 L1200 300 Z" className="hill far" />
          <path d="M0 300 L0 240 C180 190 340 250 520 210 C720 165 900 245 1080 205 L1200 230 L1200 300 Z" className="hill near" />
          {sky === 'noche' ? (
            <g className="hill-lights">
              {[140, 320, 560, 810, 1040].map((x, i) => <rect key={x} x={x} y={238 + (i % 3) * 6} width="7" height="9" rx="1.4" />)}
            </g>
          ) : (
            <g className="hill-houses">
              {[140, 320, 560, 810, 1040].map((x, i) => (
                <g key={x} transform={`translate(${x} ${236 + (i % 3) * 6})`}>
                  <rect width="26" height="18" rx="2" />
                  <path d="M-3 0 L13 -11 L29 0 Z" />
                </g>
              ))}
            </g>
          )}
        </svg>

        <div className="shelter-board-tilt">
          <svg
            className="shelter-board"
            viewBox={`0 0 ${boardW} ${boardH}`}
            style={{ maxHeight: 'min(72vh, 620px)' }}
          >
            <defs>
              <pattern id="shelter-ground-media" patternUnits="userSpaceOnUse" width="176" height="176">
                <rect width="176" height="176" fill={groundColors.a} />
                <image href={groundTexture} width="176" height="176" preserveAspectRatio="xMidYMid slice" opacity="0.44" />
              </pattern>
            </defs>
            <g transform={`translate(${ox} ${oy})`}>
              {tiles.map(({ x, y }) => {
                const { sx, sy } = iso(x, y);
                const occ = occupied.has(`${x},${y}`);
                const canBuild = !!buildItem && !removeMode && itemUnlocked(buildItem, level) && !occ;
                const tilePath = `M${sx} ${sy - TILE_H / 2} L${sx + TILE_W / 2} ${sy} L${sx} ${sy + TILE_H / 2} L${sx - TILE_W / 2} ${sy} Z`;
                return (
                  <g key={`${x}-${y}`}>
                    <path
                      d={tilePath}
                      fill={(x + y) % 2 ? groundColors.a : groundColors.b}
                      className={`shelter-tile ${canBuild ? 'is-buildable' : ''} ${removeMode && occ ? 'is-removable' : ''}`}
                      onClick={() => place(x, y)}
                    />
                    <path
                      d={tilePath}
                      className="shelter-tile-texture"
                      fill="url(#shelter-ground-media)"
                      opacity={(x + y) % 2 ? 0.34 : 0.4}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
              {sortedItems.map((p) => {
                const { sx, sy } = iso(p.x, p.y);
                const flat = FLAT_ITEMS.has(p.item);
                return (
                  <g
                    key={p.id}
                    className={`shelter-item ${removeMode ? 'is-removable' : ''} ${p.item === 'farol' ? 'has-farol' : ''}`}
                    transform={`translate(${sx} ${sy})`}
                    onClick={() => { if (removeMode) { actions.removeShelterItem(p.id); say(t('removeItem')); } }}
                  >
                    {!flat && <ellipse cx="0" cy="8" rx="24" ry="9" fill="rgba(20,40,25,.16)" />}
                    <ShelterItemSprite id={p.item} />
                  </g>
                );
              })}
              {animalsRender}
            </g>
          </svg>
        </div>

        {placed.length === 0 && <p className="shelter-empty glass-panel"><Sparkles size={15} />{t('shelterEmpty')}</p>}
        {(buildItem || removeMode) && (
          <div className="shelter-mode-hint glass-panel">
            {removeMode ? <Trash2 size={14} /> : <Hammer size={14} />}
            <span>{buildItem && !removeMode ? `${t('placeHint')} — ${t(`it_${buildItem}`)}` : t('removeHint')}</span>
            <button onClick={() => { setBuildItem(null); setRemoveMode(false); }} aria-label={t('close')}><X size={13} /></button>
          </div>
        )}
      </div>

      <header className="game-header shelter-header">
        <button className="game-back" onClick={goMenu}><ArrowLeft size={19} /><span>{t('leave')}</span></button>
        <div className="game-location">
          <span><Home size={15} /></span>
          <div><strong>{t('shelter')}</strong><small>{save.profile.name} · {grid}×{grid}</small></div>
        </div>
        <div className="game-status">
          <span className="status-live" />
          <span>{t('levelShort')} {level}</span>
          <XpBar level={level} progress={levelProgress(save.xp)} t={t} compact />
        </div>
      </header>

      <aside className="shelter-panel glass-panel">
        <div className="shelter-tabs">
          <button className={tab === 'build' ? 'is-active' : ''} onClick={() => { setTab('build'); setRemoveMode(false); }}><Hammer size={15} />{t('build')}</button>
          <button className={tab === 'env' ? 'is-active' : ''} onClick={() => { setTab('env'); setBuildItem(null); }}><Sun size={15} />{t('environment')}</button>
          <button className={tab === 'fauna' ? 'is-active' : ''} onClick={() => setTab('fauna')}><PawPrint size={15} />{t('fauna')}</button>
        </div>

        {tab === 'build' && (
          <>
            <div className="shelter-build-actions">
              <button className={removeMode ? 'is-active' : ''} onClick={() => { setRemoveMode(!removeMode); setBuildItem(null); }}>
                <Trash2 size={14} />{t('removeItem')}
              </button>
              <span className="shelter-count"><b>{placed.length}</b> {t('placedCount')}</span>
            </div>
            <div className="shelter-catalog">
              {SHELTER_ITEMS.map((item) => {
                const unlocked = itemUnlocked(item.id, level);
                const active = buildItem === item.id;
                return (
                  <button
                    key={item.id}
                    className={`catalog-card ${active ? 'is-active' : ''} ${unlocked ? '' : 'is-locked'}`}
                    onClick={() => { if (unlocked) { setBuildItem(active ? null : item.id); setRemoveMode(false); } }}
                    disabled={!unlocked}
                  >
                    <span className="catalog-sprite">
                      <svg viewBox="-55 -60 110 115"><ShelterItemSprite id={item.id} /></svg>
                    </span>
                    <span className="catalog-name">{t(`it_${item.id}`)}</span>
                    {!unlocked && <span className="catalog-lock"><Lock size={11} />{t('levelShort')} {item.level}</span>}
                  </button>
                );
              })}
            </div>
            <p className="shelter-note"><Sparkles size={12} />{t('biggerGround')}</p>
          </>
        )}

        {tab === 'env' && (
          <div className="shelter-env">
            <span className="env-label">{t('ground')}</span>
            <div className="env-row">
              {GROUNDS.map((g) => {
                const unlocked = groundUnlocked(g.id, level);
                return (
                  <button
                    key={g.id}
                    className={`env-card ground-${g.id} ${ground === g.id ? 'is-active' : ''} ${unlocked ? '' : 'is-locked'}`}
                    disabled={!unlocked}
                    onClick={() => actions.setShelterGround(g.id)}
                  >
                    <i />
                    <span>{t(`ground${g.id[0].toUpperCase()}${g.id.slice(1)}`)}</span>
                    {!unlocked && <em><Lock size={10} />{t('levelShort')} {g.level}</em>}
                  </button>
                );
              })}
            </div>
            <span className="env-label">{t('sky')}</span>
            <div className="env-row">
              {[['dia', Sun], ['atardecer', Sunset], ['noche', Moon]].map(([id, Icon]) => (
                <button
                  key={id}
                  className={`env-card sky-${id} ${sky === id ? 'is-active' : ''}`}
                  onClick={() => actions.setShelterSky(id)}
                >
                  <i><Icon size={14} /></i>
                  <span>{t(`sky${id[0].toUpperCase()}${id.slice(1)}`)}</span>
                </button>
              ))}
            </div>
            <p className="shelter-note"><Sparkles size={12} />{t('biggerGround')}</p>
          </div>
        )}

        {tab === 'fauna' && (
          <div className="shelter-fauna">
            <p className="shelter-note">{t('animalsHint')}</p>
            {SPECIES.map((sp) => {
              const here = presentSpecies.some((s) => s.id === sp.id);
              const needNames = sp.need.all ?? sp.need.any;
              const missing = needNames.filter((id) => !placed.some((p) => p.item === id));
              return (
                <div key={sp.id} className={`fauna-row ${here ? 'is-here' : ''}`}>
                  <span className="fauna-row__emoji">{sp.emoji}</span>
                  <div className="fauna-row__copy">
                    <strong>{t(`sp_${sp.id}`)}</strong>
                    <small>
                      {t('requires')}: {needNames.map((id) => t(`it_${id}`)).join(' + ')}
                      {missing.length > 0 ? ` (${missing.length})` : ''}
                    </small>
                  </div>
                  <em className={here ? 'ok' : ''}>{here ? t('visitedOk') : t('notYet')}</em>
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {toast && <Toast text={toast.text} tone={toast.tone} onClose={() => setToast(null)} />}
    </main>
  );
}
