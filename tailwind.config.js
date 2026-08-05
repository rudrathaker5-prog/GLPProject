/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary — clinical blue
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#59a6ff',
          500: '#2f83f7',
          600: '#1a63dd',
          700: '#164eb2',
          800: '#17438c',
          900: '#183b70',
        },
        // Secondary — vitality green
        vital: {
          50: '#eefdf4',
          100: '#d6fae5',
          200: '#b0f3ce',
          300: '#7ae7b0',
          400: '#3fd28c',
          500: '#17b871',
          600: '#0b955c',
          700: '#0b774c',
          800: '#0d5e3f',
          900: '#0c4d35',
        },
        warn: {
          100: '#fdf1d6',
          400: '#f2b544',
          600: '#b97b0d',
        },
        danger: {
          100: '#fde3e3',
          400: '#f0666a',
          600: '#c62c30',
        },
        ink: {
          DEFAULT: '#0d1b2a',
          soft: '#405066',
          muted: '#7b8aa0',
        },
        surface: {
          DEFAULT: '#ffffff',
          sunken: '#f4f7fb',
          raised: '#ffffff',
        },
        'dark-surface': {
          DEFAULT: '#0f1720',
          sunken: '#0a1017',
          raised: '#18222e',
        },
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
      },
      fontSize: {
        display: ['30px', { lineHeight: '36px' }],
      },
    },
  },
  plugins: [],
};
