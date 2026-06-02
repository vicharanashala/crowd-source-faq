import axios, { type AxiosAdapter, type AxiosError, type InternalAxiosRequestConfig } from 'axios';

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
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
  console.log(`${prefix} [frontend] ${message} ${short}`);
  // Fire-and-forget to backend file log
  fetch(`${import.meta.env.VITE_API_URL || '/api'}/log`, {
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
function sanitizeBody(body: unknown): unknown {
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

  // Automatic cancel for duplicate search/suggest requests
  const isSearchOrSuggest = config.url && (
    config.url.includes('/search') ||
    config.url.includes('/community/search') ||
    config.url.includes('/search/suggest')
  );

  if (isSearchOrSuggest && config.url && config.method) {
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
      localStorage.removeItem('yaksha_token');
      localStorage.removeItem('yaksha_user');

      const currentPath = window.location.pathname + window.location.search;
      if (window.location.pathname !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}&expired=true`;
      }
    }
    return Promise.reject(error);
  }
);

export default api;