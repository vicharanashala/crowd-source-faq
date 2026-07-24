/**
 * build-info.ts — v1.85
 *
 * Captures the running backend's deploy provenance at process
 * startup and exposes it through GET /api/health/build (a public,
 * unauthenticated endpoint that does NOT leak any sensitive
 * info — just the commit hash + capability flags).
 *
 * Why
 * ---
 * Operators hit "is the prod server actually running the new
 * code?" constantly. The typical answer has been `git pull` +
 * restart + hope, or `curl /csfaq/api/health/build` and squint.
 * This module makes the answer unambiguous.
 *
 * Strategy
 * -------
 * On first import we run `git rev-parse HEAD` from the backend's
 * cwd (which should be the repo root when deployed via the run
 * script or a container build). The result is cached in a
 * module-level snapshot. We try in this order:
 *
 *   1. process.env.GIT_COMMIT_SHA — if the deploy hook set it (CI/CD
 *      often injects this), read that.
 *   2. `git rev-parse HEAD` against cwd.
 *   3. { sha: null, dirty: null } — so the endpoint still works in
 *      a Docker image where `.git/` isn't shipped.
 *
 * We deliberately do NOT include branch name, author, timestamp,
 * build host, etc. The whole point is "is this server running
 * commit abc1234?". Anything more is informational drift that
 * could become a privacy concern.
 */
import { execFileSync } from 'node:child_process';

export interface BuildSnapshot {
  /** Full 40-char commit SHA, or null if unknown. */
  sha: string | null;
  /** Short 7-char prefix, or null if sha is null. Convenience for humans. */
  shortSha: string | null;
  /**
   * True if the working tree had uncommitted changes at the moment
   * we captured the SHA — useful for telling "did the operator
   * forget to commit?" at a glance.
   */
  dirty: boolean | null;
  /** When the snapshot was taken (process boot, +/- 1s). */
  capturedAt: string;
  /**
   * Capability flags — surface which admin-side endpoints exist
   * in the running build. The admin UI can consult this to
   * show "Zoom Diagnostics — not available in this build" instead
   * of a confusing 404.
   */
  features: {
    /** GET /api/zoom/auth/diagnostics — admin-only diagnostics. */
    zoomDiagnostics: boolean;
    /** POST /api/documents/reindex — admin document-library reindex. */
    documentReindex: boolean;
    /** GET /api/admin/documents/diagnostics — in-memory reindex ring. */
    documentReindexRing: boolean;
    /** AI provider-failback chain in services/ai/fallbackChain.ts. */
    providerFallbackChain: boolean;
  };
  /**
   * v1.85 — present-only mask of the env vars the runtime actually
   * needs. Designed so an operator can `curl /api/health/build`
   * (no auth) and immediately see "which required vars are
   * missing" without grepping logs or logging in.
   *
   * Values are NEVER included — only a boolean per var. A var
   * that's marked `needed: true, present: false` is exactly the
   * kind of thing that 503s `/api/zoom/auth/connect` with the
   * structured `errorCode` we just shipped.
   */
  envHealth: Array<{ name: string; needed: boolean; present: boolean; category: 'zoom' | 'auth' }>;
}

let snapshot: BuildSnapshot | null = null;

function buildSnapshot(): BuildSnapshot {
  // 1. Honor the explicit env override first (CI/CD usually
  //    knows the SHA at image-build time).
  const envSha = (process.env.GIT_COMMIT_SHA ?? '').trim();

  let sha: string | null = null;
  let dirty: boolean | null = null;

  if (envSha) {
    sha = envSha;
  } else {
    try {
      // execFileSync (not exec) so a hostile git binary or a
      // shell-injected env var can't execute arbitrary commands.
      // The cwd is the backend's process cwd — at run.sh boot
      // that's the repo root.
      const out = execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        timeout: 2_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      sha = out || null;
      // Detect dirty working tree — `git diff` exit codes:
      //   0 = no diff, 1 = diff present. We capture into a
      //   separate try since `git status --porcelain` could be
      //   slow on large trees; only do it once.
      try {
        const status = execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
          timeout: 2_000,
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        dirty = status.length > 0;
      } catch {
        dirty = null;
      }
    } catch {
      // .git missing (Docker image) or git not installed. Leave
      // sha=null so callers know we couldn't determine it.
      sha = null;
      dirty = null;
    }
  }

  // 2. Capability flags. These are static strings — we always
  //    emit the same answer for the same build, so the admin
  //    can introspect "did I deploy build X or build Y?" by
  //    hitting the endpoint. Anything that requires a runtime
  //    check (e.g. "is the queue worker running?") belongs in
  //    /api/health, not here.
  const features: BuildSnapshot['features'] = {
    zoomDiagnostics: true,
    documentReindex: true,
    documentReindexRing: true,
    providerFallbackChain: true,
  };

  // 3. Env health mask. Mirrors `needed` from the Connect handler's
  //    structured-error path so an operator can confirm the
  //    missing vars without making any admin calls. Empty-string
  //    counts as !present (catches `'  '` and accidental newline
  //    pastes). All entries have `needed: true` — we don't enumerate
  //    optional vars here. This is a "what's broken right now"
  //    tool, not a complete env dump.
  const envHealth: BuildSnapshot['envHealth'] = [
    { name: 'ZOOM_CLIENT_ID',        category: 'zoom', needed: true, present: !!(process.env.ZOOM_CLIENT_ID ?? '').trim() },
    { name: 'ZOOM_CLIENT_SECRET',    category: 'zoom', needed: true, present: !!(process.env.ZOOM_CLIENT_SECRET ?? '').trim() },
    // ZOOM_REDIRECT_URI is technically optional (runtime builds
    // it from the request host) but listed here so operators see
    // "ah, prod has it pinned" if they've set one.
    { name: 'ZOOM_REDIRECT_URI',     category: 'zoom', needed: false, present: !!(process.env.ZOOM_REDIRECT_URI ?? '').trim() },
    { name: 'ZOOM_WEBHOOK_SECRET_TOKEN', category: 'zoom', needed: true, present: !!(process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '').trim() },
    // State HMAC: either OAUTH_STATE_SECRET OR JWT_SECRET is required.
    // We expose both so the operator can see which one is set.
    { name: 'OAUTH_STATE_SECRET',    category: 'auth', needed: true, present: !!(process.env.OAUTH_STATE_SECRET ?? '').trim() },
    { name: 'JWT_SECRET',            category: 'auth', needed: true, present: !!(process.env.JWT_SECRET ?? '').trim() },
  ];

  return {
    sha,
    shortSha: sha ? sha.slice(0, 7) : null,
    dirty,
    capturedAt: new Date().toISOString(),
    features,
    envHealth,
  };
}

/**
 * Returns the cached snapshot, capturing it on first call.
 * Subsequent calls are O(1).
 */
export function getBuildSnapshot(): BuildSnapshot {
  if (!snapshot) snapshot = buildSnapshot();
  return snapshot;
}
