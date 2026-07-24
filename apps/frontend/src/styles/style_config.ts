/**
 * style_config.ts — Centralised Tailwind class-string constants
 *
 * Purpose: every theme-aware Tailwind class string used in the frontend
 * is defined here by re-exporting from modular style category modules.
 * Components import from this file instead of writing class strings inline.
 *
 * This maintains full backwards compatibility with all existing imports.
 */

export * from './typography';
export * from './layout';
export * from './surfaces';
export * from './controls';
export * from './status';
export * from './feedback';
export * from './loading';
export * from './components';
