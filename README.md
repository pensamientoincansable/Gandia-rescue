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
  isométricas, profundidad por parallax y sombras. Subir de nivel en el modo rescate
  desbloquea elementos (naranjo, charca, caja-nido, farolillo…) y atrae fauna de
  Gandía (erizo, jabalí, mochuelo, garza…).
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
