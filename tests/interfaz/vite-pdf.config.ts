import { defineConfig, mergeConfig } from 'vite';
import path from 'node:path';
import movil from '../../mobile/vite.config';

// Mismos plugins y Workbox del build normal; sólo agrega una entrada de
// medición y cambia la salida. No publica ni habilita una pantalla productiva.
export default defineConfig(mergeConfig(movil, {
  build: {
    outDir: path.resolve(__dirname, '../../scratch/c2-pdf/build-candidata'),
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        app: path.resolve(__dirname, '../../mobile/index.html'),
        pdf: path.resolve(__dirname, 'pdf-build-entry.ts'),
      },
    },
  },
}));
