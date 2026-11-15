/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'theme-bg': 'var(--color-bg)',
        'theme-surface': 'var(--color-surface)',
        'theme-surface2': 'var(--color-surface2)',
        'theme-border': 'var(--color-border)',
        'theme-text': 'var(--color-text)',
        'theme-muted': 'var(--color-muted)',
        'theme-primary': 'var(--color-primary)',
        'theme-primary-rgb': 'var(--color-primary-rgb)',
        'theme-accent': 'var(--color-accent)',
        'theme-accent-rgb': 'var(--color-accent-rgb)',
        'theme-primary-bg': 'var(--color-primary-bg)',
        'theme-primary-border': 'var(--color-primary-border)',
        'theme-primary-text': 'var(--color-primary-text)',
        'theme-primary-hover': 'var(--color-primary-hover)',
        'theme-accent-hover': 'var(--color-accent-hover)',
        'theme-danger': 'var(--color-danger)',
        'theme-success': 'var(--color-success)',
        'theme-warning': 'var(--color-warning)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
