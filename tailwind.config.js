/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        headline: ['Plus Jakarta Sans', 'sans-serif'],
        body: ['Public Sans', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#fff9ef',
          dim: '#dfd9d0',
          bright: '#fff9ef',
          'container-lowest': '#ffffff',
          'container-low': '#f9f3e9',
          container: '#f3ede4',
          'container-high': '#ede7de',
          'container-highest': '#e8e2d8',
        },
        'on-surface': { DEFAULT: '#1d1b16', variant: '#5c403b' },
        'on-background': '#1d1b16',
        primary: { DEFAULT: '#b81400', container: '#dd3119' },
        'on-primary': { DEFAULT: '#ffffff', container: '#fffbff' },
        secondary: { DEFAULT: '#895100', container: '#ffa942' },
        'on-secondary': { DEFAULT: '#ffffff', container: '#6e4000' },
        tertiary: { DEFAULT: '#5f5c54', container: '#78746c' },
        'on-tertiary': { DEFAULT: '#ffffff' },
        outline: { DEFAULT: '#916f69', variant: '#e5bdb6' },
        error: { DEFAULT: '#ba1a1a', container: '#ffdad6' },
        'on-error': { DEFAULT: '#ffffff', container: '#93000a' },
        'inverse-surface': '#33302a',
        'inverse-on-surface': '#f6f0e6',
        'inverse-primary': '#ffb4a6',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
