import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getActiveProgramId } from '../../utils/api';

const adminApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/csfaq/api',
  headers: { 'Content-Type': 'application/json' },
});

adminApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('yaksha_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Read the active program id from the same module-level variable
  // the main api.ts interceptor uses (`utils/api.ts` -> `activeProgramId`,
  // written by `ProgramContext` via `setActiveProgramId`). Falls back to
  // localStorage on cold start (before `ProgramProvider` has booted) so
  // the very first request after a reload still carries the header.
  const programId =
    getActiveProgramId()
    ?? localStorage.getItem('yaksha_active_program_id')
    ?? localStorage.getItem('yaksha_active_batch_id');
  if (programId) {
    config.headers['x-program-id'] = programId;
  }
  return config;
});

// ── Token refresh queue (mirrors the pattern in utils/api.ts) ───────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
};

adminApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { __reqId?: string; __start?: number };

    // 401 on the refresh endpoint itself — don't retry, just hard-logout.
    if (config?.url?.includes('/auth/refresh')) {
      localStorage.removeItem('yaksha_token');
      localStorage.removeItem('yaksha_refresh_token');
      localStorage.removeItem('yaksha_user');
      window.dispatchEvent(new CustomEvent('auth:logout'));
      window.location.href = '/?next=/admin';
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('yaksha_refresh_token');

      if (refreshToken && config) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: (token: string) => {
                config.headers.Authorization = `Bearer ${token}`;
                resolve(adminApi(config));
              },
              reject: (err: any) => { reject(err); },
            });
          });
        }

        isRefreshing = true;
        const refreshUrl = `${import.meta.env.VITE_API_URL || '/csfaq/api'}/auth/refresh`;

        try {
          const res = await axios.post(refreshUrl, { refreshToken });
          const { token: newAccessToken, refreshToken: newRefreshToken } = res.data as { token: string; refreshToken: string };
          localStorage.setItem('yaksha_token', newAccessToken);
          localStorage.setItem('yaksha_refresh_token', newRefreshToken);

          config.headers.Authorization = `Bearer ${newAccessToken}`;
          processQueue(null, newAccessToken);
          return adminApi(config);
        } catch (refreshError) {
          localStorage.removeItem('yaksha_token');
          localStorage.removeItem('yaksha_refresh_token');
          localStorage.removeItem('yaksha_user');
          processQueue(refreshError, null);
          window.dispatchEvent(new CustomEvent('auth:logout'));
          window.location.href = '/?next=/admin';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      // No refresh token — clear state and redirect.
      localStorage.removeItem('yaksha_token');
      localStorage.removeItem('yaksha_refresh_token');
      localStorage.removeItem('yaksha_user');
      window.dispatchEvent(new CustomEvent('auth:logout'));
      window.location.href = '/?next=/admin';
    }

    return Promise.reject(error);
  }
);

export default adminApi;