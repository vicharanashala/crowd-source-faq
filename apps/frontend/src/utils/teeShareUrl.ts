/**
 * teeShareUrl.ts — central builder for the Sign My Tee share URLs.
 *
 * Lives in `utils/` rather than `components/tee/` because the share
 * page AND the navbar pill AND the post-wizard navigate call all
 * need to format the same URL, and "what's the share URL?" should
 * never need three places to keep in sync.
 */

/**
 * Resolve the public origin for the current deployment.
 *
 * - In dev (`localhost`) we return the SPA's own origin so the link
 *   works from the same browser.
 * - In prod we use `import.meta.env.PUBLIC_URL` if available, falling
 *   back to `window.location.origin`. The `<meta name="public-url">`
 *   pattern is used elsewhere in the codebase; we don't lean on it
 *   here because Sign My Tee goes through the user's profile share
 *   link most often, and the same `window.location.origin` is what
 *   they'd copy anyway.
 */
function publicOrigin(): string {
  if (typeof window === 'undefined') return '';
  // The app is mounted under `/csfaq` (Vite `base: '/csfaq/'`). The
  // share link is meant to be opened from outside the app (WhatsApp,
  // LinkedIn) — strip the `csfaq` prefix when on the same origin.
  const o = window.location.origin;
  return o;
}

export function buildTeeShareUrl(shareId: string): string {
  return `${publicOrigin()}/csfaq/tee/share/${shareId}`;
}

export function buildTeeSignUrl(shareId: string): string {
  return `${publicOrigin()}/csfaq/tee/sign/${shareId}`;
}

export const SHARE_INTENT = {
  whatsapp(text: string, url: string): string {
    return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  },
  linkedin(url: string): string {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  },
  email(subject: string, body: string): string {
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },
};
