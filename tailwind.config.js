/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'fade-up': 'fadeUp 0.8s ease-out forwards',
        'scale': 'scale 0.6s ease-out forwards',
        'float-up': 'floatUp 0.5s ease-out forwards',
        'bounce': 'bounce 1s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { 
            opacity: '0',
            transform: 'translateY(20px)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)'
          },
        },
        scale: {
          '0%': {
            opacity: '0',
            transform: 'scale(0.9)'
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1)'
          },
        },
        floatUp: {
          '0%': {
            opacity: '0',
            transform: 'translate(-50%, -45%)'
          },
          '100%': {
            opacity: '1',
            transform: 'translate(-50%, -50%)'
          },
        },
      },
      scale: {
        '115': '1.15',
      },
    },
  },
  plugins: [],
}