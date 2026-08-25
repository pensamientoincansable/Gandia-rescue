import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');

/**
 * GitHub Pages está configurado para servir la raíz de `main` sin ejecutar
 * Vite. Generamos un bundle autocontenido y versionado en `static/` para que el
 * index raíz pueda arrancar también en un servidor de archivos estáticos.
 */
await build({
  configFile: false,
  root,
  base: './',
  publicDir: resolve(root, 'public'),
  plugins: [react()],
  build: {
    outDir: resolve(root, 'static'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(root, 'src/main.jsx'),
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames(assetInfo) {
          const names = assetInfo.names ?? [assetInfo.name ?? ''];
          return names.some((name) => name.endsWith('.css'))
            ? 'app.css'
            : 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
