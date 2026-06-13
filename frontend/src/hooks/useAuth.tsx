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
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
  fetchUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('yaksha_user');
      return saved ? (JSON.parse(saved) as User) : null;
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
          localStorage.removeItem('yaksha_user');
          setUser(null);
        })
        .finally(() => setLoading(false));
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'yaksha_token') {
        if (!e.newValue) {
          // Token deleted in another tab (logout)
          setUser(null);
        } else {
          // Token updated in another tab (login)
          setLoading(true);
          api.get('/auth/me')
            .then((res) => setUser(res.data.user as User))
            .catch(() => {
              localStorage.removeItem('yaksha_token');
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

  const login = async (email: string, password: string): Promise<User> => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user: loggedInUser } = res.data as { token: string; user: User };
    localStorage.setItem('yaksha_token', token);
    localStorage.setItem('yaksha_user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  };

  const register = async (name: string, email: string, password: string): Promise<User> => {
    const res = await api.post('/auth/register', { name, email, password });
    const { token, user: registeredUser } = res.data as { token: string; user: User };
    localStorage.setItem('yaksha_token', token);
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
    if (token) {
      api.post('/auth/logout').catch(() => {});
    }
    localStorage.removeItem('yaksha_token');
    localStorage.removeItem('yaksha_user');
    setUser(null);
  };

  const fetchUser = async (): Promise<void> => {
    try {
      const res = await api.get('/auth/me');
      const updatedUser = res.data.user as User;
      localStorage.setItem('yaksha_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error) {
      console.error('Failed to fetch user', error);
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