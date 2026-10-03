import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');

function entradaAislada(): Plugin {
  return {
    name: 'prueba-pdf-aislada',
    enforce: 'post',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      // También protege el experimento si un componente recibe nuevos imports.
      const prohibidos = Array.from(this.getModuleIds()).filter(id => {
        const ruta = id.replace(/\\/g, '/');
        return /\/node_modules\/(?:@firebase|firebase)\//.test(ruta)
          || /\/src\/main\/firebase\//.test(ruta)
          || /\/mobile\/src\/(?:App\.tsx|context\/AuthContext\.tsx|lib\/firebase-mobile\.ts)(?:\?|$)/.test(ruta);
      });
      if (prohibidos.length) this.error(`La prueba PDF importó acceso a la app/base:\n${prohibidos.join('\n')}`);

      // La fuente tiene nombre propio; el artefacto se sirve en / de un origen aislado.
      const html = bundle['pdf-preview.html'];
      if (!html || html.type !== 'asset') this.error('No se generó la entrada HTML de prueba.');
      delete bundle['pdf-preview.html'];
      html.fileName = 'index.html';
      bundle['index.html'] = html;
    },
  };
}

// No hereda mobile/vite.config.ts: no añade entrada, alias ni define de Firebase.
// Servir este directorio en un origen propio; / no comparte worker con la app real.
export default defineConfig({
  root: __dirname,
  publicDir: path.join(repo, 'mobile/public'),
  plugins: [
    react(),
    entradaAislada(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: '/prueba-pdf',
        name: 'Glow Heaven · Prueba PDF',
        short_name: 'Prueba PDF',
        description: 'Prueba de PDF con datos ficticios, sin acceso al negocio.',
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
        cacheId: 'glow-heaven-prueba-pdf',
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.join(repo, 'mobile/src'),
      '@core': path.join(repo, 'src/core'),
      '@shared': path.join(repo, 'src/shared'),
    },
  },
  // Usa el PostCSS móvil, cuyo Tailwind apunta a una ruta absoluta propia.
  css: { postcss: path.join(repo, 'mobile') },
  build: {
    outDir: path.join(repo, 'scratch/c2-pdf/preview'),
    emptyOutDir: true,
    rollupOptions: { input: path.join(__dirname, 'pdf-preview.html') },
  },
});
