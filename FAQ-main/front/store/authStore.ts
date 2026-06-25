import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string; _id?: string; name: string; email: string;
  role: "student" | "staff" | "admin"; avatar: string;
  title: string; bio: string; bookmarks: string[];
}

interface AuthState {
  user: User | null; token: string | null; isHydrated: boolean;
  setAuth: (user: User, token: string) => void;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void; setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null, token: null, isHydrated: false,
      setAuth: (user, token) => {
        if (typeof window !== "undefined") localStorage.setItem("token", token);
        set({ user, token });
      },
      updateUser: (updates) => {
        const cur = get().user;
        if (cur) set({ user: { ...cur, ...updates } });
      },
      logout: () => {
        if (typeof window !== "undefined") localStorage.removeItem("token");
        set({ user: null, token: null });
      },
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "vicharanashala-auth",
      onRehydrateStorage: () => (state) => { state?.setHydrated(); },
    }
  )
);
