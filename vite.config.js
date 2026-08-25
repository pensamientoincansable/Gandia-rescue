import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Las rutas relativas permiten publicar el build bajo cualquier subruta.
  base: './',
  // El index híbrido usa el código fuente con Vite (desarrollo y build) y el
  // bundle ya compilado cuando GitHub Pages sirve el repositorio directamente.
  define: {
    'import.meta.env.GANDIA_BUILD_SOURCE': JSON.stringify(command === 'build'),
  },
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
}));
