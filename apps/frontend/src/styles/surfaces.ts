/**
 * Surfaces - Background, card, modal, and surface treatments.
 * All use the bg-card / bg-bg / border-border token chain.
 */

export const surfaceCard        = 'bg-card border border-border rounded-xl';
export const surfaceCardFlat   = 'bg-card';
export const surfaceCardHover  = 'bg-card hover:bg-card-hover border border-border rounded-xl p-5 transition-colors';
export const surfaceCardPadded = 'bg-card border border-border rounded-xl p-5';
export const surfaceCardInline = 'bg-card border border-border rounded-2xl p-4';

export const surfaceMuted      = 'bg-mist border border-border rounded-xl';
export const surfaceMutedFlat  = 'bg-mist';

export const surfacePage       = 'bg-bg text-ink';
export const surfaceOverlay    = 'bg-ink/40 backdrop-blur-sm';

/* Modal/dialog panel — used by DialogShell/DialogPanel. */
export const surfaceModal      = 'bg-card border border-border rounded-2xl shadow-float';
