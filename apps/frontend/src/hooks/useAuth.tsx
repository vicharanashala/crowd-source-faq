import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../utils/api';

// Shape of the user object stored in localStorage and returned from API.
export interface User {
  _id?: string;
  name?: string;
  email?: string;
  role?: string;
  avatar?: { url: string; publicId: string };
  welcomePackageOnboarded?: boolean;
  // v1.68 — onboarding CMS + project capacity (PR #62). The
  // PR added these to the backend IUser but the frontend
  // User didn't get the matching fields. Without them, the
  // [key: string]: unknown index signature resolves them to
  // `unknown`, which fails to assign to ReactNode (the
  // MyProjectTab "Type '{}' is not assignable to type
  // 'ReactNode'" errors). Each field is optional because
  // the same User shape is shared with users that haven't
  // been assigned a project yet.
  projectAssigned?: string;
  mentorAssigned?: string;
  projectAssignedAt?: Date;
  projectSelectionLocked?: boolean;
  // Index signature kept for forward-compat with backend fields the
  // client hasn't been taught about yet.
  [key: string]: unknown;
}

export interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  // v1.70 — inviteToken is required when the controlled-registration
  // gate is enabled. Backend will 403 with "missing_token" or
  // "invalid_token" if it doesn't match the active admin-issued token.
  // The token arrives from `?token=...` in the URL when the user clicks
  // an admin-shared invite link.
  register: (name: string, email: string, password: string, inviteToken?: string) => Promise<User>;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
  fetchUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // H4: validate the cached user shape before trusting it. A tampered or
  // stale localStorage value would crash the entire app on first render.
  // We require a non-empty `_id` or `email` string — minimum signal that
  // it's a real user record. Otherwise treat as logged-out.
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('yaksha_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved) as User;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !(typeof parsed._id === 'string' && parsed._id.length > 0) &&
          !(typeof parsed.email === 'string' && parsed.email.length > 0)
      ) {
        localStorage.removeItem('yaksha_user');
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = localStorage.getItem('yaksha_token');
    if (!token) {
      setLoading(false);
    } else {
      api.get('/auth/me')
        .then((res) => setUser(res.data.user as User))
        .catch(() => {
          localStorage.removeItem('yaksha_token');
          localStorage.removeItem('yaksha_refresh_token');
          localStorage.removeItem('yaksha_user');
          setUser(null);
        })
        .finally(() => setLoading(false));
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'yaksha_token') {
        if (!e.newValue) {
          // Token deleted in another tab (logout)
          localStorage.removeItem('yaksha_refresh_token');
          setUser(null);
        } else {
          // Token updated in another tab (login)
          setLoading(true);
          api.get('/auth/me')
            .then((res) => setUser(res.data.user as User))
            .catch(() => {
              localStorage.removeItem('yaksha_token');
              localStorage.removeItem('yaksha_refresh_token');
              localStorage.removeItem('yaksha_user');
              setUser(null);
            })
            .finally(() => setLoading(false));
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // H2: also listen for the same-tab `auth:logout` event fired by api.ts's
  // 401 interceptor. The `storage` event only fires across tabs, so without
  // this, a 401 in the same tab would clear localStorage but leave the
  // React user state stale (UI still shows logged-in, every click triggers
  // another 401 + auth modal). This makes the in-tab logout instant.
  useEffect(() => {
    const handleAuthLogout = () => setUser(null);
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await api.post('/auth/login', { email, password });
    const { token, refreshToken, user: loggedInUser } = res.data as { token: string; refreshToken: string; user: User };
    localStorage.setItem('yaksha_token', token);
    localStorage.setItem('yaksha_refresh_token', refreshToken);
    localStorage.setItem('yaksha_user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  };

  const register = async (name: string, email: string, password: string, inviteToken?: string): Promise<User> => {
    // v1.70 — append `?token=` when the caller has one (typically because
    // they arrived via /?token=xyz invite link). Backend gate rejects with
    // 403 if the gate is closed or the token doesn't match.
    const url = inviteToken ? `/auth/register?token=${encodeURIComponent(inviteToken)}` : '/auth/register';
    const res = await api.post(url, { name, email, password });
    const { token, refreshToken, user: registeredUser } = res.data as { token: string; refreshToken: string; user: User };
    localStorage.setItem('yaksha_token', token);
    localStorage.setItem('yaksha_refresh_token', refreshToken);
    localStorage.setItem('yaksha_user', JSON.stringify(registeredUser));
    setUser(registeredUser);
    return registeredUser;
  };

  const logout = (): void => {
    // Fire-and-forget server-side revocation. If the call fails (offline,
    // expired token, etc.) we still clear local state — the user is leaving
    // either way, and the server-side blocklist will catch any reuse within
    // the JWT's natural expiry window if the call succeeded.
    const token = localStorage.getItem('yaksha_token');
    const refreshToken = localStorage.getItem('yaksha_refresh_token');
    if (token) {
      api.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    localStorage.removeItem('yaksha_token');
    localStorage.removeItem('yaksha_refresh_token');
    localStorage.removeItem('yaksha_user');
    setUser(null);
  };

  const fetchUser = async (): Promise<void> => {
    try {
      const res = await api.get('/auth/me');
      const updatedUser = res.data.user as User;
      // L2: don't leak raw server output to console — keep debugging
      // info in the existing /api/log endpoint instead (api.ts interceptor
      // already sends a structured log there for every request).
      if (!updatedUser) return;
      localStorage.setItem('yaksha_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch {
      // Surface handled inside api.ts interceptor; user state stays as-is.
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, login, register, logout, loading, isAuthenticated: !!user, fetchUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};