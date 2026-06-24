/**
 * requireAuth – auth guard helper
 *
 * Usage:
 *   requireAuth(isLoggedIn, openAuth, () => likeFAQ(id))
 *
 * If logged in  → runs the action immediately.
 * If logged out → opens the auth modal and queues the action.
 *                 After login the action runs automatically.
 */
export function requireAuth(isLoggedIn, openAuth, action) {
  if (isLoggedIn) {
    action();
  } else {
    openAuth(action);
  }
}
