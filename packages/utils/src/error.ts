/**
 * Map any error to a user-friendly message string.
 * Used by both frontend (Axios errors) and backend (generic errors).
 *
 * @param err - The caught error (unknown type)
 * @param fallback - Default message if error can't be parsed
 */
export function friendlyError(err: unknown, fallback: string): string {
  if (err === null || err === undefined) return fallback;

  // Axios-style error
  const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
  const status = axiosErr?.response?.status;

  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return "You don't have permission to do that.";

  if (status && status >= 400 && status < 500) {
    const msg = axiosErr?.response?.data?.message;
    if (typeof msg === 'string' && msg.length > 0 && msg.length < 200) {
      const lower = msg.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('not authorized') ||
        lower.includes('jwt') ||
        lower.includes('forbidden')
      ) {
        return 'Please sign in to continue.';
      }
      return msg;
    }
  }

  // Generic Error
  if (err instanceof Error && err.message) {
    return err.message.length < 200 ? err.message : fallback;
  }

  return fallback;
}

/**
 * Type guard for network/connection errors.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('network') || msg.includes('econnrefused') || msg.includes('fetch');
  }
  return false;
}
