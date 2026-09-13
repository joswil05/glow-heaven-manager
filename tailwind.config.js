/** @type {import('tailwindcss').Config} */

/**
 * Los colores salen de variables CSS definidas en `temas.css`, no de valores
 * fijos. La paleta anterior era Tailwind renombrado: `navy` era exactamente
 * `slate` y `brand` exactamente `indigo`, así que ningún color había sido
 * elegido para este producto. Esos nombres ya no existen: cada vista usa los
 * semánticos de abajo.
 *
 * `<alpha-value>` es lo que permite que sigan funcionando las opacidades
 * (`bg-superficie/60`, `border-borde/50`) con variables.
 */
const c = (nombre) => `rgb(var(--${nombre}) / <alpha-value>)`;

export default {
  // Solo el renderer de escritorio. Antes incluia tambien mobile/**, asi que
  // el CSS de escritorio cargaba clases de la PWA que nunca usa.
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --- Nombres semánticos: lo que hay que usar de acá en adelante ---
        inverso: c('inverso'),
        'inverso-2': c('inverso-2'),
        'inverso-texto': c('inverso-texto'),
        'inverso-texto-2': c('inverso-texto-2'),
        velo: c('velo'),
        'serie-1': c('serie-1'),
        'serie-2': c('serie-2'),
        'serie-3': c('serie-3'),
        fondo: c('fondo'),
        superficie: c('superficie'),
        'superficie-2': c('superficie-2'),
        'superficie-3': c('superficie-3'),
        borde: c('borde'),
        'borde-fuerte': c('borde-fuerte'),
        texto: c('texto'),
        'texto-2': c('texto-2'),
        'texto-3': c('texto-3'),
        barra: c('barra'),
        'barra-2': c('barra-2'),
        'barra-texto': c('barra-texto'),
        'barra-texto-2': c('barra-texto-2'),
        acento: c('acento'),
        'acento-fuerte': c('acento-fuerte'),
        'acento-suave': c('acento-suave'),
        'acento-texto': c('acento-texto'),
        // Cada rol trae sus tres tokens: relleno, texto (-fuerte) y tinte
        // (-suave), mas el texto que va ENCIMA del relleno (-texto). El
        // detalle de cuando usar cada uno esta en temas.css.
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

        success: {
          50: c('exito-suave'),
          100: c('exito-suave'),
          500: c('exito'),
          600: c('exito'),
          700: c('exito'),
          800: c('exito'),
        },
        warning: {
          50: c('alerta-suave'),
          100: c('alerta-suave'),
          500: c('alerta'),
          600: c('alerta'),
          700: c('alerta'),
          800: c('alerta'),
        },
        danger: {
          50: c('peligro-suave'),
          100: c('peligro-suave'),
          200: c('peligro-suave'),
          500: c('peligro'),
          600: c('peligro'),
          700: c('peligro'),
          800: c('peligro'),
        },
      },
      // Las sombras salen de tokens para poder cambiar con el tema: en oscuro
      // tienen que ser mas opacas y amplias o no se leen. Ver temas.css.
      boxShadow: {
        xs: 'var(--sombra-1)',
        sm: 'var(--sombra-1)',
        DEFAULT: 'var(--sombra-1)',
        md: 'var(--sombra-2)',
        lg: 'var(--sombra-2)',
        xl: 'var(--sombra-3)',
        '2xl': 'var(--sombra-3)',
      },
      borderRadius: {
        '2xl': '0.75rem',
        '3xl': '0.75rem',
      },
      fontSize: {
        caption: ['0.6875rem', { lineHeight: '1rem', fontWeight: '400' }],
        label: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        body: ['0.875rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        title: ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        display: ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'metric-sm': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        metric: ['2rem', { lineHeight: '2.25rem', fontWeight: '650' }],
      },
    },
  },
  plugins: [],
};
