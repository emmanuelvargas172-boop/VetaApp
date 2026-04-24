/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        verde: {
          oscuro: '#1B4332',
          medio: '#2D6A4F',
          claro: '#40916C',
          suave: '#74C69D',
          fondo: '#F0FAF4',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: []
};
