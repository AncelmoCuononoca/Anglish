/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0D1B2A',
        'bg-card': '#112236',
        'bg-elevated': '#162840',
        purple: {
          DEFAULT: '#7F77DD',
          light: '#9B94E8',
          dark: '#5F58B0',
        },
        cyan: {
          DEFAULT: '#00D4FF',
          light: '#33DDFF',
          dark: '#00A8CC',
        },
        green: {
          DEFAULT: '#00FF88',
          light: '#33FFA0',
          dark: '#00CC6A',
        },
        gold: {
          DEFAULT: '#FFD700',
          light: '#FFE033',
          dark: '#CCA800',
        },
        pink: {
          DEFAULT: '#FF006E',
          light: '#FF3388',
          dark: '#CC0058',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-purple-cyan': 'linear-gradient(135deg, #7F77DD, #00D4FF)',
        'gradient-glow': 'linear-gradient(135deg, rgba(127,119,221,0.15), rgba(0,212,255,0.15))',
      },
      boxShadow: {
        'glow-purple': '0 0 20px rgba(127,119,221,0.4)',
        'glow-cyan': '0 0 20px rgba(0,212,255,0.4)',
        'glow-green': '0 0 20px rgba(0,255,136,0.4)',
        'glow-gold': '0 0 20px rgba(255,215,0,0.4)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
