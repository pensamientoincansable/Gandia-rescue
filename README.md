# Gandía — Rescate y Exploración

Prototipo web interactivo y responsive de un juego de conservación y descubrimiento
ambientado en Gandía (La Safor), con navegación 360° estilo Street View.

## Incluye

- **Perfil del jugador**: se crea al empezar con nombre y avatar; empieza en el nivel 1 (0 XP).
- **Desplazamiento 360° estilo Street View**: panoramas equirrectangulares de Gandía
  renderizados con WebGL (arrastrar para mirar, rueda/pellizco para el zoom, flechas
  del teclado y puntos de navegación entre zonas).
- **Dos formas de desplazarse**:
  - *Modo rescate (geolocalización)*: la zona se elige automáticamente con el GPS real,
    la distancia al aviso se mide en el mundo real y la XP depende de la proximidad
    (bonus a menos de 40 m, XP reducida sin GPS).
  - *Modo exploración (virtual)*: viajes entre panoramas desde cualquier lugar,
    con las mismas misiones pero **sin XP** ni subida de nivel.
- **Fotos de las zonas de rescate**: se pueden añadir fotos (archivo o cámara del móvil)
  a cada zona; se guardan reducidas en `localStorage`.
- **Mi refugio 2.5D**: constructor estilo Animal Crossing (simplificado) con losetas
  isométricas texturizadas, profundidad por parallax, cielo ambiental y sombras. Subir
  de nivel en el modo rescate desbloquea elementos (naranjo, charca, caja-nido,
  farolillo…) y atrae fauna de Gandía (erizo, jabalí, mochuelo, garza…).
- **Paisajes 3D con acabado PS2**: las texturas de suelo/cielo y los árboles FBX
  suministrados en `media/` se aplican por hábitat (costa, huerta, marjal, Serpis,
  casco histórico y Montdúver). La vegetación se instancia y deja las carreteras,
  caminos y pistas forestales transitables y visibles.
- Localización completa en español, valenciano e inglés.
- Colección educativa de fauna local que se desbloquea completando rescates.
- Layout responsive, controles táctiles y ayudas de teclado.
- Preferencias y partida persistentes mediante `localStorage`.

## Desarrollo

```bash
npm install
npm run dev -- --host 0.0.0.0
```

## Producción

```bash
npm run build
npm run preview -- --host 0.0.0.0
```

## Prueba de humo

`scripts/smoke.mjs` monta el bundle de producción en jsdom y recorre el flujo
principal (perfil → menú → rescate → refugio → exploración → persistencia):

```bash
npx vite build && node scripts/smoke.mjs
```

## Prueba de los panoramas 360°

`scripts/pano-check.mjs` monta el bundle con un contexto WebGL instrumentado y
descargas HTTP reales para comprobar que la imagen equirectangular de cada zona
se descarga (sin 404), se sube como textura y se dibuja en cada fotograma, tanto
en el bundle de `dist/` como en el de `static/` servido desde un subdirectorio
como hace GitHub Pages:

```bash
npm run build && npm run check:pano
```

Los panoramas viven en `src/assets/panoramas/` y se importan desde
`src/lib/game.js`: así Vite genera para cada build una URL válida relativa al
propio bundle. No deben referenciarse con rutas sueltas tipo
`panoramas/platja.jpg`, porque se resuelven contra el documento y devuelven 404
cuando el sitio no se publica en la raíz del dominio.

## Despliegue en GitHub Pages

GitHub Pages está configurado para servir directamente la raíz de `main`. Como ese
servidor no transforma JSX ni resuelve dependencias npm, `npm run build` genera
también un bundle autocontenido en `static/` (incluidos los panoramas de
`public/panoramas/`). El `index.html` usa el código fuente cuando se ejecuta
mediante Vite y carga ese bundle cuando se sirve como página estática. Así, la URL
`/Gandia-rescue/` funciona sin cambiar la configuración del repositorio.

Después de modificar `src`, ejecuta `npm run build` y versiona los cambios generados
en `static/` junto con el código fuente.

El prototipo está preparado como una capa de experiencia web para conectar
posteriormente proveedores reales de WebXR, servicios de mapas 3D y guardado en la nube.

## Arquitectura: datos separados del código

La jugabilidad está **desacoplada del código**. Ningún valor numérico, tecla ni
tabla de daño vive dentro de la lógica: todo se declara en JSON editable y se
carga en tiempo de ejecución con `fetch()`.

### Datos de configuración — `public/config/`

| Fichero | Contenido |
| --- | --- |
| `keybindings.json` | Mapeo de teclado, ratón y gamepad a **acciones abstractas** (`MOVE_FORWARD`, `JUMP`, `DASH`, `ATTACK_LIGHT`, `INTERACT`…), más ajustes de zona muerta y sensibilidad. |
| `player_stats.json` | Física y parámetros de jugabilidad: velocidad, aceleración, frenado, fricción, dirección, gravedad, salto, vida y resistencia máximas, cámaras, radios de interacción, progresión y audio. |
| `moveset.json` | Sistema de combate: movimientos con *startup/active/recovery frames*, ventanas de cancelación, hitboxes, daño base, aturdimiento, retroceso (knockback), secuencias de combo y tabla de multiplicadores de daño. |

Vite los publica tal cual en `dist/config/` y `static/config/`, así que se pueden
retocar **sin recompilar** el juego.

### Módulos del motor — `src/engine/`

| Módulo | Responsabilidad |
| --- | --- |
| `ConfigLoader.js` | Carga asíncrona y cacheada de los JSON vía `fetch()`, con respaldo empaquetado y recarga en caliente (`invalidateConfigCache`). |
| `InputManager.js` | Traduce teclado / ratón / gamepad en acciones abstractas. API por frame (`isDown`, `wasPressed`, `axis`), búfer de entradas para combos, entradas virtuales del HUD táctil y *rebinding* persistente. |
| `PlayerController.js` | Física de la furgoneta y del guardián a pie + máquina de estados de combos, consumiendo `player_stats.json` y `moveset.json`. Agnóstico del renderizador. |
| `GameLoop.js` | Bucle principal con paso fijo que orquesta `InputManager` + `PlayerController` y delega el dibujado. |
| `defaults.js` | Copias empaquetadas de los mismos JSON, usadas sólo como respaldo sin red (tests, jsdom). |

### Arte ambiental de `media/` — `public/world/`

`media/` conserva los originales entregados. Antes de compilar, `npm run assets:world`
prepara una selección curada en `public/world/`: mapas de terreno, nubes, atlas PNG y
los FBX de árboles/arbustos. `WorldAssets.js` resuelve esas rutas para Vite y para el
bundle `static/` de GitHub Pages; `VegetationLibrary.js` carga los FBX con `FBXLoader`
y los convierte en `InstancedMesh` para que el detalle visual no sacrifique rendimiento.

Los grupos se colocan fuera de los ejes de carretera y del cauce: no se modifica la
geometría ni el recorrido de las rutas existentes. Las antiguas copas cónicas usadas
para árboles han sido sustituidas por estos modelos texturizados.

### Modelos 3D — `public/models/`

Los humanos y animales se cargan con **modelos 3D `.glb`** mediante `GLTFLoader` y
se animan con un **`AnimationMixer`** (reposo, caminar, correr y saltar). El
manifiesto `public/config/models.json` mapea cada entidad a su `.glb` y al nombre
de sus clips de animación.

| Fichero | Animaciones |
| --- | --- |
| `models/ranger.glb` | `Idle`, `Walk`, `Run`, `Jump` |
| `models/npc.glb` | `Idle`, `Walk`, `Talk` |
| `models/animals/*.glb` (8 especies) | `Idle` (+ `Fly` en la gaviota) |

Los `.glb` se generan proceduralmente (low-poly con jerarquía de pivotes por
extremidad y `AnimationClips`) con Three.js:

```bash
node scripts/gen-models.mjs   # regenera public/models/*.glb
```

Diseño defensivo: si un modelo falta o su descarga falla, la entidad usa
automáticamente el monigote de primitivas como respaldo. Para sustituirlos por
modelos externos basta con dejar otro `.glb` en `public/models/` y editar
`public/config/models.json`.

### Ejemplo de integración

```js
import { GameLoop } from './src/engine/GameLoop.js';

const loop = await GameLoop.create({
  terrain,                 // { getHeight(x, z, zoneId) }
  zoneId: 'platja',
  getTargets: () => fauna.getHittableAnimals(),
  onAction: (action) => {
    if (action === 'TOGGLE_SIREN') van.toggleSiren();
    if (action === 'HONK') van.honk();
    if (action === 'INTERACT') interactWithNearestTarget();
  },
  onUpdate: (dt, { state }) => {
    van.group.position.set(state.position.x, state.position.y, state.position.z);
    van.group.rotation.set(-state.pitch, state.heading, -state.roll, 'YXZ');
  },
  onRender: () => renderer.render(scene, camera),
});

loop.start();
```

Cambiar el salto a otra tecla, subir la velocidad máxima o reequilibrar un combo
sólo requiere editar el JSON correspondiente.

### Pruebas

```bash
npm run test:engine     # InputManager + PlayerController contra los JSON reales
npm run test:movement   # conducir, bajar junto a la furgoneta, caminar y volver a subir
npm run test:world      # texturas / FBX de media disponibles, parseables y con UVs
npm test                # todas las suites del motor y recursos ambientales
npm run build && npm run test:ui      # controles del HUD sobre el bundle montado
npm run build && npm run test:smoke   # recorrido end-to-end en jsdom
```

### Controles

| Tecla | Acción |
| --- | --- |
| `W` / `↑` | Acelerar / avanzar |
| `S` / `↓` | Frenar / marcha atrás |
| `A` `D` / `←` `→` | Girar |
| `Espacio` | Freno de mano / esprintar a pie |
| `F` | Bajar de la furgoneta / volver a subir |
| `E` / `Enter` | Interactuar con animales, vecinos y pistas |
| `V` | Cambiar cámara (3ª persona / cabina / cenital) |
| `B` · `L` · `H` | Sirena · faros · claxon |

Todas se pueden reasignar en `public/config/keybindings.json`, y también
responden mando y los controles táctiles del HUD.
