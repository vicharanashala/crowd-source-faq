/**
 * InternshipEndDateGate — Sign My Tee v1.87
 *
 * Sits in the React tree near `AuthProvider` and blocks the entire
 * app behind an `InternshipEndDateModal` until the user has entered
 * their `internshipEndDate`. We delegate the "have they entered it?"
 * decision to the BE's `/api/tee/me/eligibility` endpoint — same
 * one the navbar pill uses — so the gate state and the pill state
 * never drift out of sync.
 *
 * The provider renders `<>{children}</>` when the gate is closed;
 * it renders `<><InternshipEndDateModal /><>{children}</>` when it's
 * open. The modal sits on `z-[100]` so it overlays every page
 * uniformly, including admin pages.
 *
 * Why a provider instead of inlining the modal at every protected
 * route: a gate that fires on each page independently can be
 * dismissed and then re-appears on refresh. A single tree-level
 * provider is the canonical, user-friendly shape.
 *
 * Why not just inline a useEffect at the Navbar: the user may have
 * a saved URL in their tabs and skip the navbar path entirely.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTeeEligibility } from '../hooks/useTeeEligibility';
import InternshipEndDateModal from '../components/tee/InternshipEndDateModal';

interface Props {
  children: ReactNode;
}

export default function InternshipEndDateGate({ children }: Props) {
  const { isAuthenticated } = useAuth();
  const { requiresInternshipEndDate, refresh } = useTeeEligibility();
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    // Show the modal iff the user is authenticated AND the BE says
    // they haven't entered the date yet. We treat "loading" the same
    // as "no requirement" — never want to flash the modal on a cold
    // load just because the eligibility fetch is in flight.
    setShowing(isAuthenticated && requiresInternshipEndDate);
  }, [isAuthenticated, requiresInternshipEndDate]);

  if (!isAuthenticated) return <>{children}</>;
  if (!showing) return <>{children}</>;

  return (
    <>
      <InternshipEndDateModal
        isOpen={showing}
        onResolved={() => {
          // Re-fetch eligibility so subsequent renders see
          // `requiresInternshipEndDate = false`. The next effect
          // pass closes the modal automatically.
          refresh();
          setShowing(false);
        }}
      />
      {children}
    </>
  );
}
