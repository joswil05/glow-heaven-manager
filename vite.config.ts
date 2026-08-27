import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: path.join(__dirname, 'src/main/index.ts'),
        vite: {
          resolve: {
            alias: {
              '@core': path.resolve(__dirname, './src/core'),
              '@shared': path.resolve(__dirname, './src/shared'),
            },
          },
          build: {
            outDir: path.join(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      {
        entry: path.join(__dirname, 'src/preload/index.ts'),
        vite: {
          build: {
            outDir: path.join(__dirname, 'dist-electron/preload'),
          },
        },
        onstart(args) {
          args.reload();
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@renderer': path.resolve(__dirname, './src/renderer/src'),
    },
  },
  root: path.join(__dirname, 'src/renderer'),
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
