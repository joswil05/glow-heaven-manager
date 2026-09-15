import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Configuración para las pruebas contra el emulador oficial de Firestore.
 *
 * A diferencia de `vitest.config.ts`, NO carga `setup-firestore.ts`: acá se
 * usa el SDK real, no el motor falso en memoria.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/emulador.test.ts',
      'tests/motor-real/**/*.test.ts',
      'tests/interfaz/**/*.test.ts',
    ],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // El emulador es un servidor compartido: en paralelo las suites se
    // borrarían los datos entre ellas.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@renderer': path.resolve(__dirname, './src/renderer/src'),
    },
  },
});
