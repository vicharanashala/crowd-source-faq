/**
 * Layout primitives - Flex / grid containers.
 * No color tokens here — pure shape.
 */

export const flexRow        = 'flex items-center gap-2';
export const flexRowSm      = 'flex items-center gap-1';
export const flexRowLg      = 'flex items-center gap-3';
export const flexRowXl      = 'flex items-center gap-4';
export const flexRowWrap    = 'flex items-center gap-2 flex-wrap';
export const flexRowBetween = 'flex items-center justify-between';
export const flexCol        = 'flex flex-col gap-2';
export const flexColSm      = 'flex flex-col gap-1';
export const flexColMd      = 'flex flex-col gap-3';

export const flexRowStart    = 'flex items-start gap-3';
export const flexColStart   = 'flex flex-col gap-0.5';

export const flexGrow       = 'flex-1 min-w-0';
export const flexShrink     = 'flex-shrink-0';
export const flexNoShrink   = 'flex-shrink-0';

export const stackSm        = 'space-y-2';
export const stackMd        = 'space-y-3';
export const stackLg        = 'space-y-4';
export const stackXs        = 'space-y-1';

/* ── Modal backdrop ──────────────────────────────────────────────
 * Two z-indexes: z50 (default) and z60 (above page chrome like the
 * guided tour). The backdrop is a fixed overlay with the dim+blur
 * combo that matches the existing admin-* modals. */
export const modalBackdrop       = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm';
export const modalBackdropHigh   = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm';
