import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

export type User = {
  _id: string;
  id?: string; // fallback
  displayName: string;
  name?: string; // fallback
  email: string;
  role: "student" | "moderator" | "admin";
  avatar?: string;
  title?: string;
  reputationScore: number;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Check auth session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get("/auth/me");
        if (res.data.success && res.data.data.user) {
          const u = res.data.data.user;
          // Add fallbacks to maintain mock data compatibility in the UI
          u.id = u._id;
          u.name = u.displayName;
          setUser(u);
        }
      } catch (err) {
        // Not logged in or expired session
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.post("/auth/login", { email, password });
      if (res.data.success && res.data.data.user) {
        const u = res.data.data.user;
        u.id = u._id;
        u.name = u.displayName;
        setUser(u);
      }
    } catch (err: any) {
      throw new Error(err.response?.data?.error?.message || "Invalid credentials");
    }
  };

  const register = async (displayName: string, email: string, password: string) => {
    try {
      const res = await api.post("/auth/register", { displayName, email, password });
      if (res.data.success && res.data.data.user) {
        const u = res.data.data.user;
        u.id = u._id;
        u.name = u.displayName;
        setUser(u);
      }
    } catch (err: any) {
      throw new Error(err.response?.data?.error?.message || "Registration failed");
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
      setUser(null);
    } catch (err: any) {
      console.error("Logout failed", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthContextProvider");
  }
  return context;
};
