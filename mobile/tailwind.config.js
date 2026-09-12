import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const c = (nombre) => `rgb(var(--${nombre}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
    './mobile/index.html',
    './mobile/src/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        inverso: c('inverso'),
        'inverso-2': c('inverso-2'),
        'inverso-texto': c('inverso-texto'),
        'inverso-texto-2': c('inverso-texto-2'),
        velo: c('velo'),
        fondo: c('fondo'),
        superficie: c('superficie'),
        'superficie-2': c('superficie-2'),
        borde: c('borde'),
        'borde-fuerte': c('borde-fuerte'),
        texto: c('texto'),
        'texto-2': c('texto-2'),
        'texto-3': c('texto-3'),
        acento: c('acento'),
        'acento-fuerte': c('acento-fuerte'),
        'acento-suave': c('acento-suave'),
        'acento-texto': c('acento-texto'),
        success: { 50: c('exito-suave'), 500: c('exito'), 600: c('exito'), 700: c('exito') },
        warning: { 50: c('alerta-suave'), 500: c('alerta'), 600: c('alerta'), 700: c('alerta') },
        danger: { 50: c('peligro-suave'), 500: c('peligro'), 600: c('peligro'), 700: c('peligro') },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      fontSize: {
        caption: ['0.6875rem', { lineHeight: '1rem', fontWeight: '400' }],
        label: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        body: ['0.9375rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        title: ['1.0625rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        display: ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'metric-sm': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        metric: ['1.875rem', { lineHeight: '2.25rem', fontWeight: '650' }],
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Roboto', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'm3-1': '0 1px 3px 1px rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'm3-2': '0 2px 6px 2px rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'm3-3': '0 4px 12px 3px rgba(0, 0, 0, 0.08), 0 2px 4px 0 rgba(0, 0, 0, 0.04)',
        'm3-bottom': '0 -4px 16px rgba(0, 0, 0, 0.06)',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
