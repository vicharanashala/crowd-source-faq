/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['DM Serif Display', 'Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: 'var(--color-bg)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',
        mist: 'var(--color-mist)',
        cream: 'var(--color-cream)',
        elevated: 'var(--color-elevated)',
        chip: 'var(--color-chip, var(--color-mist))',
        ink: {
          DEFAULT: 'var(--color-ink)',
          soft: 'var(--color-ink-soft)',
          faint: 'var(--color-ink-faint)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          light: 'var(--color-accent-light)',
          hover: 'var(--color-accent-hover)',
          dark: 'var(--color-accent-dark)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          light: 'var(--color-success-light)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          light: 'var(--color-warning-light)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          light: 'var(--color-danger-light)',
        },
        // Legacy sage kept for backward compatibility
        sage: {
          50:  '#f4f7f4', 100: '#e2ece2', 200: '#c3d9c3', 300: '#96bc96',
          400: '#649964', 500: '#457a45', 600: '#336133', 700: '#294e29',
          800: '#223f22', 900: '#1c341c',
        },
        // Admin panel colors (always dark)
        admin: {
          bg: '#030307', surface: '#0d0d18', card: '#0f0f1e',
          purple: '#8b5cf6', 'purple-bright': '#a78bfa',
          blue: '#3b82f6', cyan: '#22d3ee', green: '#10b981',
          yellow: '#f59e0b', red: '#ef4444',
          text: '#e4e4f0', muted: '#6b6b8a',
        },
      },
      boxShadow: {
        'subtle': 'var(--shadow-subtle)',
        'card': 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'float': 'var(--shadow-float)',
        'glow': 'var(--shadow-glow)',
        'glow-purple': '0 0 24px rgba(139,92,246,0.4)',
        'glow-blue': '0 0 24px rgba(59,130,246,0.4)',
        'glow-cyan': '0 0 24px rgba(34,211,238,0.4)',
        'admin-card': '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', maxHeight: '0' },
          to: { opacity: '1', maxHeight: '320px' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
        'slide-down': 'slide-down 0.35s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
      },
    },
  },
  plugins: [],
};
