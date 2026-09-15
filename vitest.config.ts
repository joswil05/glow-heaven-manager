import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup-firestore.ts'],
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // El emulador tiene su propia configuración: usa el SDK real, no el falso.
    // Las suites contra el motor real tienen su propia configuración
    // (`vitest.emulador.config.ts`): acá se sustituye el SDK por el falso y
    // correrían contra un Firestore que no es el que quieren probar.
    exclude: ['tests/emulador.test.ts', 'tests/motor-real/**', '**/node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@renderer': path.resolve(__dirname, './src/renderer/src'),
      // Los mismos alias que usa el build del móvil, para poder probar su
      // lógica propia (`mobile/src/lib/*`) con el resto de las suites.
      '@repos': path.resolve(__dirname, './src/main/firebase/repositories'),
      '@firebase-client': path.resolve(__dirname, './src/main/firebase/client.ts'),
    },
  },
});
