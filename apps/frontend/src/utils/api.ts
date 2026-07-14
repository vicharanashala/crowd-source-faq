import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Get default adapter
const defaultAdapter = axios.getAdapter(axios.defaults.adapter);

interface CacheEntry {
  data: any;
  headers: any;
  status: number;
  statusText: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

// Cache configuration
const CACHE_CONFIGS: Record<string, number> = {
  '/faq': 5 * 60 * 1000,              // 5 minutes
  '/search/trending': 5 * 60 * 1000,  // 5 minutes
  '/search/suggest': 1 * 60 * 1000,   // 1 minute
  '/notifications': 10 * 1000,        // 10 seconds
  '/notifications/unread-count': 10 * 1000, // 10 seconds
  '/notifications/tea': 10 * 1000,    // 10 seconds
  '/community': 15 * 1000,            // 15 seconds
};

// Check if request is cacheable and return TTL
const getRequestTTL = (url: string | undefined, method: string | undefined): number => {
  if (!url || method?.toLowerCase() !== 'get') {
    // Special case: Cache POST /search for 1 minute
    if (url?.endsWith('/search') && method?.toLowerCase() === 'post') {
      return 1 * 60 * 1000;
    }
    return 0;
  }
  
  // Match URL against config
  for (const [key, ttl] of Object.entries(CACHE_CONFIGS)) {
    if (url.endsWith(key) || url.includes(`${key}?`) || url.includes(`${key}/`)) {
      return ttl;
    }
  }
  return 0;
};

// Generate cache key
const getCacheKey = (config: any): string => {
  const method = config.method?.toLowerCase() || '';
  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  const data = config.data ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : '';
  return `${method}:${url}:${params}:${data}`;
};

// Clear cache on mutating operations
export const clearApiCache = () => {
  cache.clear();
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/csfaq/api',
  headers: { 'Content-Type': 'application/json' },
});

// Setup caching adapter
api.defaults.adapter = async (config) => {
  const method = config.method?.toLowerCase() || 'get';
  const url = config.url || '';
  
  // Check if we should invalidate cache (any mutating method that is not read-only)
  const isMutation = ['post', 'put', 'delete', 'patch'].includes(method) && 
                     !url.endsWith('/search') && 
                     !url.includes('/faq/check-match') &&
                     !url.includes('/community/check-duplicate');
                     
  if (isMutation) {
    clearApiCache();
  }
  
  const ttl = getRequestTTL(url, method);
  if (ttl > 0 && defaultAdapter) {
    const key = getCacheKey(config);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return {
        data: JSON.parse(JSON.stringify(cached.data)), // Deep copy
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
        config,
        request: null,
      };
    }
    
    // Perform actual request
    const response = await defaultAdapter(config);
    
    // Store in cache if successful
    if (response.status >= 200 && response.status < 300) {
      cache.set(key, {
        data: JSON.parse(JSON.stringify(response.data)), // Deep copy
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
        timestamp: Date.now(),
      });
    }
    
    return response;
  }
  
  if (!defaultAdapter) {
    throw new Error('Default adapter is not defined');
  }
  return defaultAdapter(config);
};

// ─── File + terminal log sink (dev only) ─────────────────────────────────────
const IS_DEV = import.meta.env.DEV === true;
const C = { red: (s: string) => `\x1b[31m${s}\x1b[0m`, yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, cyan: (s: string) => `\x1b[36m${s}\x1b[0m`, dim: (s: string) => `\x1b[2m${s}\x1b[0m` };

function sendToFileLog(level: string, message: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const ts = new Date().toISOString().slice(11, 23);
  const colorFn = level === 'ERROR' ? C.red : level === 'WARN' ? C.yellow : C.cyan;
  const prefix = `${C.dim(`[${ts}]`)} ${colorFn(`[${level}]`)}`;
  // Only log the key fields to keep it readable
  const short = meta
    ? `{ status: ${meta.status ?? '-'}, duration: ${meta.durationMs ?? '-'}ms, url: ${meta.url ?? '-'} }`
    : '';
  console.info(`${prefix} [frontend] ${message} ${short}`);
  // Fire-and-forget to backend file log
  fetch(`${import.meta.env.VITE_API_URL || '/csfaq/api'}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message, meta }),
  }).catch(() => {});
}

const pendingRequests = new Map<string, AbortController>();

// Sanitize body for logging (strip tokens/passwords)
const SANITIZE_KEYS = new Set([
  'password', 'newPassword', 'currentPassword', 'confirmPassword',
  'token', 'accessToken', 'refreshToken', 'authorization',
  'apiKey', 'api_key', 'x-api-key', 'x-api-token',
]);
function _sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SANITIZE_KEYS.has(k.toLowerCase())) { out[k] = '[REDACTED]'; continue; }
    out[k] = typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '...' : v;
  }
  return out;
}

// Request interceptor: attach JWT token + debug log
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('yaksha_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const programId = localStorage.getItem('yaksha_active_program_id') || localStorage.getItem('yaksha_active_batch_id');
  if (programId) {
    config.headers['x-program-id'] = programId;
  }

  const reqId = Math.random().toString(36).slice(2, 10);
  (config as any).__reqId = reqId;
  const start = Date.now();
  (config as any).__start = start;

  sendToFileLog('INFO', `--> ${config.method?.toUpperCase()} ${config.url}`, {
    reqId,
    method: config.method?.toUpperCase(),
    url: config.url,
    params: config.params,
  });

  // Automatic cancel for stale user-typed searches only.
  // POST /search = semantic search result (replace old result as user types).
  // GET  /search/suggest = live suggestion dropdown (replace stale suggestions).
  // GET  /search/trending is NOT included: it's a one-shot mount-time fetch
  // that should always complete. Cancelling it leaves the chips empty
  // (React StrictMode double-mount in dev triggers the previous-controller
  // abort path and shows "Failed to load trending queries." on the console).
  const isCancelableSearch =
    config.url &&
    ((config.method?.toLowerCase() === 'post' && config.url.endsWith('/search')) ||
      (config.method?.toLowerCase() === 'get' && config.url.includes('/search/suggest')));

  if (isCancelableSearch && config.url && config.method) {
    const requestKey = `${config.method}:${config.url}`;
    const previousController = pendingRequests.get(requestKey);
    if (previousController) {
      previousController.abort();
    }
    const controller = new AbortController();
    config.signal = controller.signal;
    pendingRequests.set(requestKey, controller);
  }

  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Response interceptor: debug log + 401 handling
api.interceptors.response.use(
  (response) => {
    const config = response.config;
    const reqId = (config as any).__reqId || '-';
    const start: number = (config as any).__start || Date.now();
    const duration = Date.now() - start;
    const status = response.status;

    sendToFileLog('INFO', `<-- ${config.method?.toUpperCase()} ${config.url} ${status} ${duration}ms`, {
      reqId,
      status,
      durationMs: duration,
      url: config.url,
    });

    if (config.url && config.method) {
      const requestKey = `${config.method}:${config.url}`;
      if (pendingRequests.get(requestKey)?.signal === config.signal) {
        pendingRequests.delete(requestKey);
      }
    }
    return response;
  },
  (error: AxiosError) => {
    const config = error.config;
    const reqId = (config as any).__reqId || '-';
    const start: number = (config as any).__start || Date.now();
    const duration = Date.now() - start;
    const status = error.response?.status || 0;

    // Cancelled requests (AbortController) are NOT errors. Log them at INFO
    // and clear the pendingRequests entry without triggering the 401 modal
    // or the warn/error log level.
    if (axios.isCancel(error)) {
      sendToFileLog('INFO', `<-- ${config?.method?.toUpperCase()} ${config?.url} CANCELLED ${duration}ms`, {
        reqId,
        status: 0,
        durationMs: duration,
        url: config?.url ?? 'unknown',
        message: 'request aborted by client',
      });
      if (config && config.url && config.method) {
        const requestKey = `${config.method}:${config.url}`;
        if (pendingRequests.get(requestKey)?.signal === config.signal) {
          pendingRequests.delete(requestKey);
        }
      }
      return Promise.reject(error);
    }

    const isError = status >= 500;
    const isWarn = status >= 400;

    const logLevel = isError ? 'ERROR' : isWarn ? 'WARN' : 'ERROR';
    sendToFileLog(logLevel, `<-- ${config?.method?.toUpperCase()} ${config?.url} ${status} ${duration}ms -- ${error.message}`, {
      reqId,
      status,
      durationMs: duration,
      url: config?.url ?? 'unknown',
      message: error.message,
      responseData: error.response?.data,
    });

    if (config && config.url && config.method) {
      const requestKey = `${config.method}:${config.url}`;
      if (pendingRequests.get(requestKey)?.signal === config.signal) {
        pendingRequests.delete(requestKey);
      }
    }

    if (error.response && error.response.status === 401) {
      // If the failed request was a refresh token request itself, abort immediately.
      if (config && config.url && (config.url.endsWith('/auth/refresh') || config.url.includes('/auth/refresh'))) {
        localStorage.removeItem('yaksha_token');
        localStorage.removeItem('yaksha_refresh_token');
        localStorage.removeItem('yaksha_user');
        window.dispatchEvent(new CustomEvent('auth:logout'));
        window.dispatchEvent(new CustomEvent('authmodal:open', {
          detail: { tab: 'signin', prompt: 'Your session has expired. Please sign in again.' },
        }));
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem('yaksha_refresh_token');
      if (refreshToken && config) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: (token: string) => {
                config.headers.Authorization = `Bearer ${token}`;
                resolve(api(config));
              },
              reject: (err: any) => {
                reject(err);
              },
            });
          });
        }

        isRefreshing = true;
        const refreshUrl = `${import.meta.env.VITE_API_URL || '/csfaq/api'}/auth/refresh`;

        return axios.post(refreshUrl, { refreshToken })
          .then((res) => {
            const { token: newAccessToken, refreshToken: newRefreshToken } = res.data as { token: string; refreshToken: string };
            localStorage.setItem('yaksha_token', newAccessToken);
            localStorage.setItem('yaksha_refresh_token', newRefreshToken);

            // Retry the original request
            config.headers.Authorization = `Bearer ${newAccessToken}`;
            processQueue(null, newAccessToken);
            return api(config);
          })
          .catch((refreshError) => {
            localStorage.removeItem('yaksha_token');
            localStorage.removeItem('yaksha_refresh_token');
            localStorage.removeItem('yaksha_user');

            window.dispatchEvent(new CustomEvent('auth:logout'));
            window.dispatchEvent(new CustomEvent('authmodal:open', {
              detail: { tab: 'signin', prompt: 'Your session has expired. Please sign in again.' },
            }));

            processQueue(refreshError, null);
            return Promise.reject(error);
          })
          .finally(() => {
            isRefreshing = false;
          });
      }

      // Spec: "Never show raw auth/token errors to users." Any 401 means the
      // user tried a restricted action without (or with an expired) token —
      // pop the sign-in modal so they can fix it. The current page is
      // preserved so they land back where they were.
      const hadToken = !!localStorage.getItem('yaksha_token');
      localStorage.removeItem('yaksha_token');
      localStorage.removeItem('yaksha_refresh_token');
      localStorage.removeItem('yaksha_user');

      const prompt = hadToken
        ? 'Your session has expired. Please sign in again.'
        : 'Please sign in to continue.';
      window.dispatchEvent(new CustomEvent('authmodal:open', {
        detail: { tab: 'signin', prompt },
      }));

      // H2: also dispatch `auth:logout` so the AuthContext clears its
      // in-memory user state synchronously. Without this, the React tree
      // still thinks the user is logged in until the next reload, so
      // authenticated UI continues to render even though every protected
      // call now 401s and re-opens the modal in a loop.
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    return Promise.reject(error);
  }
);

/**
 * Map an Axios error to a user-friendly message. Strips raw backend strings
 * like "Not authorized. Token missing." or "Session expired. Please log in
 * again." and replaces them with the product copy the user should see.
 *
 * Usage:
 *   } catch (e) {
 *     setError(friendlyError(e, 'Could not save your answer.'));
 *   }
 *
 * The fallback runs when the error is non-Axios, a network failure, or a
 * 5xx — we never let a server-side message like "TypeError: cannot read
 * property 'foo' of undefined" reach the user.
 */
export function friendlyError(err: unknown, fallback: string): string {
  // Auth-related statuses — never echo the raw backend text. The modal
  // already explains the situation; the toast just needs a short hint.
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return "You don't have permission to do that.";

  // For 4xx (validation, not-found, etc.) we trust the backend's short
  // message — it's already user-safe. We only swap it out if the message
  // looks like a leaked auth-internal string.
  // M4: cap was 200 chars which truncated longer validation messages
  // (e.g. "field X with value Y failed validation because Z"). Bumped to
  // 500 to match the backend's typical validation payload size.
  if (status && status >= 400 && status < 500) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (typeof msg === 'string' && msg.length > 0 && msg.length < 500) {
      const lower = msg.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('not authorized') ||
        lower.includes('not authenticated') ||
        lower.includes('jwt') ||
        lower.includes('forbidden')
      ) {
        return 'Please sign in to continue.';
      }
      return msg;
    }
  }

  // 5xx / network / unknown — generic fallback. Logging the real error to
  // the file log happens in the interceptor above; this is just UI text.
  return fallback;
}

export default api;