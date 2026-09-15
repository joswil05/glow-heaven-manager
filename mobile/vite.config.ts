import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

/**
 * Build aparte para la PWA móvil.
 *
 * Vive en el mismo `package.json` que la app de escritorio (comparte
 * `firebase`, `react` y la lógica pura de `src/core`), pero se compila con su
 * propia configuración: el `root` es esta carpeta, la salida es
 * `dist-mobile/` y no toca nada de Electron.
 *
 * Los repositorios de `src/main/firebase/*` se reutilizan tal cual: son
 * módulos de navegador puro (`firebase/firestore` + lógica de `src/core`).
 * Lo único que no es compatible con el navegador es la referencia a
 * `process.env.*_EMULATOR_HOST` en `client.ts`, pensada para Node. El
 * `define` de abajo la reemplaza por una cadena vacía en tiempo de build, así
 * el bundle nunca llega a preguntar por un `process` global que no existe en
 * el navegador.
 */
export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: '/',
        name: 'Glow Heaven Móvil',
        short_name: 'Glow Heaven',
        description: 'Venta rápida y panel del negocio de Glow Heaven.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B0A0A',
        theme_color: '#0B0A0A',
        lang: 'es',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // La app necesita datos en vivo (ventas, stock): solo se cachea el
        // cascarón de la interfaz, nunca las respuestas de Firestore.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/icons/'),
            handler: 'CacheFirst',
            options: { cacheName: 'gh-iconos' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../src/core'),
      '@shared': path.resolve(__dirname, '../src/shared'),
      '@repos': path.resolve(__dirname, '../src/main/firebase/repositories'),
      '@firebase-client': path.resolve(__dirname, '../src/main/firebase/client.ts'),
    },
  },
  define: {
    // `client.ts` pregunta por estas variables para decidir si habla con el
    // emulador. En el navegador no existe `process`, así que se reemplazan en
    // tiempo de build.
    //
    // En una build de produccion quedan en cadena vacia y todo el cableado del
    // emulador desaparece del bundle. Solo se propagan cuando alguien las
    // define a proposito, que es lo que hacen las pruebas de interfaz contra
    // el emulador local.
    'process.env.FIRESTORE_EMULATOR_HOST': JSON.stringify(
      process.env.FIRESTORE_EMULATOR_HOST ?? ''
    ),
    'process.env.FIREBASE_AUTH_EMULATOR_HOST': JSON.stringify(
      process.env.FIREBASE_AUTH_EMULATOR_HOST ?? ''
    ),
  },
  build: {
    outDir: path.resolve(__dirname, '../dist-mobile'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    // El código reutilizado vive fuera de `mobile/`; sin esto el
    // dev server de Vite rechaza esas peticiones por estar fuera de su raíz.
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
