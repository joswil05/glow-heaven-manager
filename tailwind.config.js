/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Superficies oscuras: barra lateral, cabeceras de modal, franjas de datos.
        // Más azul que slate a propósito, para que se lea como cromo y no como gris.
        navy: {
          50: '#f2f6fc',
          100: '#e3ebf7',
          200: '#c6d8ee',
          300: '#96b6dd',
          400: '#5e8ec6',
          500: '#3a6cae',
          600: '#2a5292',
          700: '#234176',
          800: '#1f3762',
          900: '#1d2f52',
          950: '#131e36',
        },
        // Acción primaria, foco, selección, enlaces.
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Roles de estado. Nombrados por lo que significan, no por su color,
        // para que cambiarlos no obligue a tocar cada vista.
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
        },
        // Rojo verdadero, no rosado. La escala rose se percibe rosa en
        // fondos claros, que es justo lo que este rediseño elimina.
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
        },
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
        'metric-sm': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        metric: ['1.75rem', { lineHeight: '2.25rem', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};
