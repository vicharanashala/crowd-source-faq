const PHASE_ORDER = ['GENERAL', 'PHASE_1', 'PHASE_2', 'PHASE_3', 'COMPLETED'];

/**
 * A student sees GENERAL FAQs plus every phase from their current one
 * onward. Phases before their current one are already completed and
 * are hidden. A COMPLETED student only sees GENERAL + COMPLETED.
 */
export function getVisiblePhases(phase: string) {
  const index = PHASE_ORDER.indexOf(phase);
  const currentIndex = index === -1 ? 0 : index;

  if (currentIndex === 0) {
    return ['GENERAL', 'PHASE_1', 'PHASE_2', 'PHASE_3'];
  }

  if (currentIndex === PHASE_ORDER.length - 1) {
    return ['GENERAL', 'COMPLETED'];
  }

  return ['GENERAL', ...PHASE_ORDER.slice(currentIndex, PHASE_ORDER.length - 1)];
}
