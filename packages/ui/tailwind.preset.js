/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        arabic: ['"IBM Plex Sans Arabic"', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#000000',
          container: '#1c1b1b',
          fixed: '#e5e2e1',
          'fixed-dim': '#c8c6c5',
        },
        secondary: {
          DEFAULT: '#775a19',
          container: '#fed488',
          fixed: '#ffdea5',
          'fixed-dim': '#e9c176',
        },
        tertiary: {
          DEFAULT: '#000000',
          container: '#261900',
        },
        surface: {
          DEFAULT: '#fbf9f4',
          dim: '#dbdad5',
          bright: '#fbf9f4',
          container: '#f0eee9',
          'container-lowest': '#ffffff',
          'container-low': '#f5f3ee',
          'container-high': '#eae8e3',
          'container-highest': '#e4e2dd',
          variant: '#e4e2dd',
          tint: '#5f5e5e',
        },
        background: '#fbf9f4',
        on: {
          primary: '#ffffff',
          'primary-container': '#858383',
          secondary: '#ffffff',
          'secondary-container': '#785a1a',
          surface: '#1b1c19',
          'surface-variant': '#444748',
          background: '#1b1c19',
        },
        outline: {
          DEFAULT: '#747878',
          variant: '#c4c7c7',
        },
        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        }
      },
      borderRadius: {
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        base: '8px',
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        xxl: '4rem',
        gutter: '24px',
        'margin-mobile': '16px',
        'margin-desktop': '64px',
      },
      boxShadow: {
        'heritage-sm': '0 2px 8px rgba(140, 115, 67, 0.04)',
        'heritage-md': '0 4px 16px rgba(140, 115, 67, 0.08)',
        'heritage-lg': '0 12px 32px rgba(140, 115, 67, 0.12)',
      }
    },
  },
  plugins: [],
}
