import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { setupBrowserMockApi } from './mock-api';
import { LimiteDeError } from './components/LimiteDeError';
import './index.css';

setupBrowserMockApi();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* Por dentro del tema, para que la pantalla de error use la misma
          paleta; por fuera de todo lo demas, para que atrape cualquier
          excepcion de dibujado en vez de dejar la ventana vacia. */}
      <LimiteDeError>
        <ToastProvider>
          <App />
        </ToastProvider>
      </LimiteDeError>
    </ThemeProvider>
  </React.StrictMode>
);
