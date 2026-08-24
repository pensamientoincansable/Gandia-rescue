# Gandía — Rescate y Exploración

Prototipo web interactivo y responsive de un juego de conservación y descubrimiento ambientado en Gandía (La Safor).

## Incluye

- Menú principal cinematográfico con dos modos de juego.
- Localización completa en español, valenciano e inglés.
- Detección automática de controles móviles/escritorio.
- HUD de Rescate con visor AR simulado, equipo, avisos, minimapa y protocolo de ayuda no violento.
- HUD de Exploración con modo foto, navegación libre y garaje con coche, moto, bicicleta y patinete.
- Ajustes, perfil, progreso, logros y colección educativa de fauna local.
- Layout responsive, controles táctiles y ayudas de teclado/mando.
- Preferencias de idioma persistentes mediante `localStorage`.

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

El prototipo está preparado como una capa de experiencia web para conectar posteriormente proveedores reales de GPS/WebXR, servicios de mapas 3D y guardado en la nube.
