import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

/**
 * La versión nueva se aplica, pero no en medio de algo.
 *
 * Antes esto recargaba la página en el acto al detectar un despliegue. Una
 * recarga descarta lo que haya en pantalla sin guardar: si caía justo mientras
 * alguien escribía el monto de un abono, ese abono se perdía y no había forma
 * de saber que había pasado. Es raro —sólo ocurre después de un despliegue—
 * pero cuando ocurre, ocurre encima de alguien trabajando.
 *
 * Ahora se espera un momento seguro. Salir de la app es el más claro: no hay
 * nada a medio escribir que perder, y al volver ya está la versión nueva.
 * Mientras tanto la app sigue andando con la versión vieja, que funciona.
 *
 * Si nunca sale, el service worker nuevo ya tomó control igual (`skipWaiting`),
 * así que el próximo arranque trae la versión nueva sin hacer nada.
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const aplicarCuandoSeaSeguro = () => {
      if (document.visibilityState === 'hidden') {
        document.removeEventListener('visibilitychange', aplicarCuandoSeaSeguro);
        updateSW(true);
      }
    };
    document.addEventListener('visibilitychange', aplicarCuandoSeaSeguro);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
