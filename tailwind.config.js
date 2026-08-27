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
        danger: {
          50: '#fff1f2',
          100: '#ffe4e6',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
        },
        // Alias temporal: hace que toda la aplicación pase a azul sin tocar
        // un solo .tsx. Se elimina en la Task 22, cuando ya no quede
        // ningún consumidor.
        glow: {
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
        },
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
