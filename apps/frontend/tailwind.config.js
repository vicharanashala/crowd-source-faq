/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  // Scan all JS/JSX/TS/TSX files for Tailwind classes (supports incremental TS adoption)
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],

  theme: {
    extend: {
      // ShadCN semantic colors — RGB triples, sourced from CSS variables
      // defined in src/styles/index.css. Aliased to the existing warm-sage
      // palette so ShadCN components render in-house by default.
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        chart: {
          1: 'rgb(var(--chart-1) / <alpha-value>)',
          2: 'rgb(var(--chart-2) / <alpha-value>)',
          3: 'rgb(var(--chart-3) / <alpha-value>)',
          4: 'rgb(var(--chart-4) / <alpha-value>)',
          5: 'rgb(var(--chart-5) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'rgb(var(--sidebar) / <alpha-value>)',
          foreground: 'rgb(var(--sidebar-foreground) / <alpha-value>)',
          primary: 'rgb(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'rgb(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent: 'rgb(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'rgb(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'rgb(var(--sidebar-border) / <alpha-value>)',
          ring: 'rgb(var(--sidebar-ring) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // ── Typography ──────────────────────────────────────────────
      // Matches UI project (vins/Frontend): Inter for body, DM Serif Display for headings
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['DM Serif Display', 'Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },

      // ── Color Palette ───────────────────────────────────────────
      // All color values are CSS variables so they auto-respond to
      // [data-theme="dark"] on the <html> element. Light values
      // declared in :root, dark overrides in [data-theme="dark"].
      // The /<alpha-value> placeholder lets Tailwind opacity modifiers
      // (bg-bg/82, text-ink/70, etc.) work for the core color tokens.
      colors: {
        // Core neutrals — RGB triples for opacity support
        bg: 'rgb(var(--bg-primary-rgb) / <alpha-value>)',
        'bg-secondary': 'rgb(var(--bg-secondary-rgb) / <alpha-value>)',
        card: 'rgb(var(--bg-card-rgb) / <alpha-value>)',
        'card-hover': 'rgb(var(--bg-card-hover-rgb) / <alpha-value>)',
        border: 'rgb(var(--border-rgb) / <alpha-value>)',
        'border-subtle': 'rgb(var(--border-subtle-rgb) / <alpha-value>)',
        'border-medium': 'rgb(var(--border-medium-rgb) / <alpha-value>)',

        // Text hierarchy
        ink: {
          DEFAULT: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          soft: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          faint: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
        },

        // Primary accent (warm sage in light, deep green in dark)
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover-rgb) / <alpha-value>)',
          dark: 'rgb(var(--accent-hover-rgb) / <alpha-value>)',
          // light uses a pre-tinted variable — opacity via /<alpha-value> not supported
          light: 'var(--tag-high-bg)',
        },

        // Semantic colors
        success: {
          DEFAULT: 'rgb(var(--success-rgb) / <alpha-value>)',
          light: 'var(--tag-high-bg)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning-rgb) / <alpha-value>)',
          light: 'var(--tag-medium-bg)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger-rgb) / <alpha-value>)',
          light: 'var(--danger-bg)',
        },

        // Legacy sage kept for backward compatibility (will phase out)
        sage: {
          50:  '#f4f7f4',
          100: '#e2ece2',
          200: '#c3d9c3',
          300: '#96bc96',
          400: '#649964',
          500: '#457a45',
          600: '#336133',
          700: '#294e29',
          800: '#223f22',
          900: '#1c341c',
        },

        // Muted background surfaces
        mist: 'rgb(var(--bg-secondary-rgb) / <alpha-value>)',
        cream: 'rgb(var(--bg-card-hover-rgb) / <alpha-value>)',

        // Admin palette — keep as its own dark scheme, independent of site theme
        admin: {
          bg: '#030307',
          surface: '#0d0d18',
          card: '#0f0f1e',
          purple: '#8b5cf6',
          'purple-bright': '#a78bfa',
          blue: '#3b82f6',
          cyan: '#22d3ee',
          green: '#10b981',
          yellow: '#f59e0b',
          red: '#ef4444',
          text: '#e4e4f0',
          muted: '#6b6b8a',
        },
      },

      // ── Box Shadows ─────────────────────────────────────────────
      // Per-theme — light uses soft black drop shadows, dark uses
      // diffused dark shadows with optional green glow on hover.
      // Values resolve from CSS variables in src/styles/index.css.
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

      // ── Transitions ─────────────────────────────────────────────
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },

      // ── Animations ──────────────────────────────────────────────
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', maxHeight: '0' },
          to: { opacity: '1', maxHeight: '320px' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(110%) scale(0.96)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'slide-in-right-soft': {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
        'slide-down': 'slide-down 0.35s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
        'slide-in-right': 'slide-in-right 0.32s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
        'slide-in-right-soft': 'slide-in-right-soft 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
      },
    },
  },
  plugins: [],
};
