import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const c = (nombre) => `rgb(var(--${nombre}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  // Solo el código del móvil y la lógica compartida. Antes incluía
  // `./src/**`, que arrastra toda la interfaz de escritorio: el CSS del móvil
  // terminaba con clases que nunca usa (y con el slate azul del escritorio,
  // que hacía parecer sucia la auditoría de color). `core`, `shared` y
  // `main/firebase` son lógica sin JSX, así que no aportan clases.
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
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
        'superficie-3': c('superficie-3'),
        borde: c('borde'),
        'borde-fuerte': c('borde-fuerte'),
        texto: c('texto'),
        'texto-2': c('texto-2'),
        'texto-3': c('texto-3'),
        // Cada rol trae sus tres tokens: relleno, texto (-fuerte) y tinte
        // (-suave). El detalle de cuándo usar cada uno está en index.css.
        acento: c('acento'),
        'acento-fuerte': c('acento-fuerte'),
        'acento-suave': c('acento-suave'),
        'acento-texto': c('acento-texto'),
        exito: c('exito'),
        'exito-fuerte': c('exito-fuerte'),
        'exito-suave': c('exito-suave'),
        'exito-texto': c('exito-texto'),
        alerta: c('alerta'),
        'alerta-fuerte': c('alerta-fuerte'),
        'alerta-suave': c('alerta-suave'),
        'alerta-texto': c('alerta-texto'),
        peligro: c('peligro'),
        'peligro-fuerte': c('peligro-fuerte'),
        'peligro-suave': c('peligro-suave'),
        'peligro-texto': c('peligro-texto'),
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
      // Las sombras salen de tokens para poder cambiar con el tema: en oscuro
      // tienen que ser más opacas y amplias o no se leen. Ver index.css.
      // `shadow-xs/sm/md/lg/xl` se redefinen contra los mismos tokens para
      // que no queden dos escalas de sombra conviviendo.
      boxShadow: {
        'm3-1': 'var(--sombra-1)',
        'm3-2': 'var(--sombra-2)',
        'm3-3': 'var(--sombra-3)',
        'm3-bottom': 'var(--sombra-inferior)',
        xs: 'var(--sombra-1)',
        sm: 'var(--sombra-1)',
        DEFAULT: 'var(--sombra-1)',
        md: 'var(--sombra-2)',
        lg: 'var(--sombra-2)',
        xl: 'var(--sombra-3)',
        '2xl': 'var(--sombra-3)',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
