import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../utils/api';

// Shape of the user object stored in localStorage and returned from API.
export interface User {
  _id?: string;
  name?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
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
    localStorage.removeItem('yaksha_token');
    localStorage.removeItem('yaksha_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, register, logout, loading, isAuthenticated: !!user }}
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