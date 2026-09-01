/**
 * Copias empaquetadas de la configuración, usadas SÓLO como respaldo cuando
 * fetch() no está disponible (jsdom, pruebas de humo, modo offline) o el
 * fichero servido no se puede leer. La fuente editable sigue siendo
 * `public/config/*.json`: estos imports apuntan al mismo fichero.
 */
import keybindings from '../../public/config/keybindings.json' with { type: 'json' };
import playerStats from '../../public/config/player_stats.json' with { type: 'json' };
import moveset from '../../public/config/moveset.json' with { type: 'json' };

export const DEFAULT_KEYBINDINGS = keybindings;
export const DEFAULT_PLAYER_STATS = playerStats;
export const DEFAULT_MOVESET = moveset;

export const CONFIG_FALLBACKS = {
  keybindings,
  playerStats,
  moveset,
};

export default CONFIG_FALLBACKS;
