import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Recargar automáticamente cuando haya nueva versión desplegada
    updateSW(true);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
