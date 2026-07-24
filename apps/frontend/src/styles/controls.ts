/**
 * Controls - Buttons, inputs, selects, textareas.
 * All buttons and inputs use theme variables for the fill / border / text.
 */

export const buttonPrimary    = 'inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-text font-medium px-4 py-2 transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonSecondary  = 'inline-flex items-center justify-center gap-2 rounded-lg bg-card border border-border text-ink font-medium px-4 py-2 transition-all duration-200 hover:bg-mist disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonGhost      = 'inline-flex items-center justify-center gap-2 rounded-lg bg-transparent text-ink-soft font-medium px-4 py-2 transition-all duration-200 hover:bg-mist hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonDanger     = 'inline-flex items-center justify-center gap-2 rounded-lg bg-danger text-white font-medium px-4 py-2 transition-all duration-200 hover:bg-danger/80 disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonSm         = 'inline-flex items-center justify-center gap-1.5 rounded-md bg-accent text-accent-text text-xs font-medium px-2.5 py-1 transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonIcon       = 'inline-flex items-center justify-center w-8 h-8 rounded-md text-ink-soft hover:bg-mist hover:text-ink transition-colors';
export const buttonIconSm     = 'inline-flex items-center justify-center w-6 h-6 rounded text-ink-soft hover:bg-mist hover:text-ink transition-colors';

export const inputBase        = 'w-full px-3 py-2 rounded-md text-sm text-ink bg-card border border-border outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all placeholder-ink-faint disabled:opacity-50 disabled:cursor-not-allowed';
export const inputError       = 'w-full px-3 py-2 rounded-md text-sm text-ink bg-card border border-danger outline-none focus:border-danger focus:ring-2 focus:ring-danger/20 transition-all placeholder-ink-faint';
export const inputSearch      = 'w-full pl-10 pr-3 py-2 rounded-lg text-sm text-ink bg-card border border-border outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all placeholder-ink-faint';

export const numberInput          = 'w-20 rounded-lg border border-border bg-mist px-2 py-1.5 text-xs text-ink text-center focus:outline-none focus:ring-2 focus:ring-accent/25';
export const textAreaBase         = 'w-full rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none';

/* ── Admin Form Controls ────────────────────────────────────────── */
export const adminInput           = 'w-full px-3 py-2 rounded-md text-sm text-ink bg-bg-secondary border border-border outline-none focus:border-accent transition-colors placeholder-ink-faint';
export const adminTextarea        = 'w-full px-3 py-2 rounded-md text-sm text-ink bg-bg-secondary border border-border outline-none focus:border-accent transition-colors resize-none placeholder-ink-faint';
export const adminSelect          = 'px-2.5 py-1.5 rounded-md text-sm text-ink bg-bg-secondary border border-border outline-none focus:border-accent transition-colors';
export const adminSearchInput     = 'w-full pl-8 pr-3 py-1.5 rounded-md text-sm text-ink bg-bg-secondary border border-border outline-none focus:border-accent transition-colors placeholder-ink-faint';
export const adminLabel           = 'block text-xs font-medium text-ink-soft mb-1';

/* ── Admin Buttons ──────────────────────────────────────────────── */
export const adminBtnPrimary      = 'px-4 py-2 rounded-md text-sm font-medium bg-accent text-accent-text hover:bg-accent-hover disabled:opacity-40 transition-colors';
export const adminBtnSecondary    = 'px-4 py-2 rounded-md text-sm font-medium bg-bg-secondary text-ink border border-border hover:bg-mist disabled:opacity-40 transition-colors';
export const adminBtnGhost        = 'px-4 py-2 rounded-md text-sm text-ink-faint hover:text-ink hover:bg-mist transition-colors';
export const adminBtnOutline      = 'px-4 py-2 rounded-md text-sm border border-border text-ink-soft hover:bg-mist disabled:opacity-40 transition-colors';
export const adminBtnDanger       = 'px-4 py-2 rounded-md text-sm font-medium text-white bg-danger hover:bg-danger/80 disabled:opacity-40 transition-colors';
export const adminBtnWarn         = 'px-4 py-2 rounded-md text-sm font-medium text-white bg-warning hover:bg-warning/80 disabled:opacity-40 transition-colors';
export const adminBtnSuccess      = 'px-4 py-2 rounded-md text-sm font-medium text-white bg-success hover:bg-success/80 disabled:opacity-50 transition-colors';
export const adminBtnSmOutline    = 'px-2.5 py-1 rounded-md text-[10px] border border-border text-ink-soft hover:border-border-medium hover:text-ink transition-colors';

/* ── Community Buttons ──────────────────────────────────────────── */
export const buttonCommunityAsk   = 'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-medium bg-accent/14 border border-accent/30 text-accent transition-all duration-200 hover:bg-accent/18 hover:border-accent/40 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgb(var(--accent-rgb)/0.15)] active:translate-y-0 active:bg-accent/14 dark:bg-accent/10 dark:border-accent/25 dark:hover:bg-accent/15 dark:hover:border-accent/40 dark:hover:text-accent-hover dark:hover:shadow-[0_0_20px_rgb(var(--accent-rgb)/0.15)] dark:active:bg-accent/12 dark:active:shadow-[0_0_8px_rgb(var(--accent-rgb)/0.10)]';


/* ── Form inputs ──────────────────────────────────────────────────
 * The standard text input used by admin forms (rule, w-full, etc.)
 * — promoted because 8+ files were inlining the same 8 utility
 * classes. If a second-input style appears, add a sibling export
 * (inputReadOnly, inputError, etc.) rather than overloading this. */
export const inputStandard       = 'w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:border-accent transition-all';

/* ── Form input (with focus ring) ────────────────────────────────
 * Variant for forms that want a visible focus-ring affordance in
 * addition to the border-color change. AdminProjectsPage uses this
 * across 10+ fields. Keep the base classes (padding/radius/border)
 * in sync with inputStandard above. */
export const inputStandardRing  = 'w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all';

/* ── Legacy btn-* class compatibility ──────────────────────────────
 * Pre-split refactor, the .btn-base / .btn-primary / .btn-secondary /
 * .btn-ghost / .btn-outline / .btn-danger / .btn-warn / .btn-success
 * styles lived in index.css. The CSS-split refactor removed them, but
 * 20+ components still reference the class names. Re-export the
 * equivalent Tailwind utility strings here so those references keep
 * working AND match the design system.
 *
 * v1.79.1 (HOTFIX) — the variants originally referenced `btn-base` as
 * a CSS class name (which no longer exists), so concatenating
 * `${btnBase} ${btnPrimary}` produced a button that was missing padding
 * and border-radius (looked like a dark unstyled block in screenshots).
 * Fix: each variant inlines the shared base classes directly so the
 * const works standalone OR concatenated. New code should still prefer
 * the admin-prefixed variants above for admin UI. */
export const btnBase       = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30';
export const btnPrimary    = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-accent text-accent-text hover:bg-accent-hover active:bg-accent-hover/90 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30';
export const btnSecondary  = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-bg-secondary text-ink border border-border hover:bg-mist active:bg-mist/80 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30';
export const btnGhost      = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 text-ink-soft hover:text-ink hover:bg-mist/60 active:bg-mist disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30';
export const btnOutline    = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 border border-border text-ink hover:bg-mist active:bg-mist/80 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30';
export const btnDanger     = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-danger text-white hover:bg-danger/85 active:bg-danger/80 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30';
export const btnWarn       = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-warning text-white hover:bg-warning/85 active:bg-warning/80 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30';
export const btnSuccess    = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-success text-white hover:bg-success/85 active:bg-success/80 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30';
