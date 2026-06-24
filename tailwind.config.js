/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Editorial serif for headings/display — carries the "academic" register.
        // Swap for any serif you've loaded (Fraunces, Source Serif 4, etc.)
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Gold replaces the old cool "brand" blue as the primary accent.
        brand: {
          50:  '#fbf6e9',
          100: '#f5ead0',
          200: '#ead2a0',
          300: '#deb86d',
          400: '#d2a44a',
          500: '#c9a13b',   // primary gold accent
          600: '#ad872f',
          700: '#8a6b26',
          800: '#6c531f',
          900: '#574318',
          950: '#33270e',
        },
        // Warm ink/charcoal scale replaces the old cool slate-on-black scale.
        // Numeric steps 50→900 now run light→dark on a WARM neutral axis
        // (cream to charcoal) instead of the old dark-mode axis.
        // slate-925 is kept only so existing `bg-slate-925` references in
        // components still resolve — it now points at parchment, not black.
        slate: {
          50:  '#f7f4ee',
          100: '#efebe1',
          200: '#e2dccb',
          300: '#c7bfa8',
          400: '#9a9077',   // muted/secondary text on cream
          500: '#7c7260',
          600: '#5b5447',
          700: '#433f37',
          800: '#2c2a26',
          900: '#1c2333',   // ink — primary text / headings
          925: '#f7f4ee',   // legacy key, now = page background (light)
        },
        ink: '#1c2333',
        parchment: '#f7f4ee',
        paper: '#fffdf9',
        critical: '#c0392b',
        high: '#b5762a',
        medium: '#7a8c3d',
        low: '#3f7a5c',
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,35,51,0.05), 0 6px 18px -6px rgba(28,35,51,0.10)',
        'card-hover': '0 4px 10px rgba(28,35,51,0.08), 0 16px 32px -12px rgba(28,35,51,0.18)',
        'glow-critical': '0 0 0 0 rgba(192,57,43,0.35)',
      },
      animation: {
        'slide-in-left': 'slideInLeft 0.35s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.16,1,0.3,1)',
        'fade-up': 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        // New: pulsing glow specifically for critical-urgency indicators.
        'pulse-glow': 'pulseGlow 2.2s ease-in-out infinite',
      },
      keyframes: {
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(192,57,43,0.30)' },
          '50%': { boxShadow: '0 0 0 7px rgba(192,57,43,0)' },
        },
      },
    },
  },
  plugins: [],
}
