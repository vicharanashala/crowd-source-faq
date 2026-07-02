import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  spurtiPoints: number;
  streak: number;
  badges: string[];
  college?: string;
  studentId?: string;
}

export interface SpurtiData {
  spurtiPoints: number;
  streak: number;
  rank: string;
  badges: string[];
  logs: Array<{ id: string; action: string; xpEarned: number; createdAt: string }>;
  limits: {
    prevLimit: number;
    nextLimit: number;
    percentage: number;
  };
}

export interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  spurti: SpurtiData | null;
  notifications: Notification[];
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, studentId?: string, college?: string) => Promise<void>;
  logout: () => Promise<void>;
  triggerActivity: (action: string, faqId?: string) => Promise<void>;
  refreshSpurti: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  refetchUser: () => Promise<void>;
  errorMsg: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [spurti, setSpurti] = useState<SpurtiData | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clearError = () => setErrorMsg(null);

  // Fetch current user details
  const refetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (e) {
      const savedUser = localStorage.getItem('demo_user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      } else {
        setUser(null);
      }
    }
  };

  // Fetch Spurti Gamification data
  const refreshSpurti = async () => {
    try {
      const res = await fetch('/api/user/spurti');
      if (res.ok) {
        const data = await res.json();
        setSpurti(data);
      } else {
        throw new Error();
      }
    } catch (e) {
      if (user) {
        const rank = user.spurtiPoints < 100 ? 'Seeker' : user.spurtiPoints < 300 ? 'Scholar' : user.spurtiPoints < 600 ? 'Sage' : 'Oracle';
        let prevLimit = 0;
        let nextLimit = 100;
        if (rank === 'Scholar') { prevLimit = 100; nextLimit = 300; }
        else if (rank === 'Sage') { prevLimit = 300; nextLimit = 600; }
        else if (rank === 'Oracle') { prevLimit = 600; nextLimit = 1000; }

        setSpurti({
          spurtiPoints: user.spurtiPoints,
          streak: user.streak,
          rank,
          badges: user.badges,
          logs: JSON.parse(localStorage.getItem('demo_logs') || '[]'),
          limits: {
            prevLimit,
            nextLimit,
            percentage: Math.min(100, Math.max(0, ((user.spurtiPoints - prevLimit) / (nextLimit - prevLimit)) * 100)),
          }
        });
      }
    }
  };

  // Fetch notifications
  const refreshNotifications = async () => {
    try {
      const res = await fetch('/api/user/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      } else {
        throw new Error();
      }
    } catch (e) {
      const savedNotifs = localStorage.getItem('demo_notifs');
      setNotifications(savedNotifs ? JSON.parse(savedNotifs) : []);
    }
  };

  // Mark all notifications as read
  const markNotificationsRead = async () => {
    try {
      const res = await fetch('/api/user/notifications/read', { method: 'POST' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      } else {
        throw new Error();
      }
    } catch (e) {
      const updated = notifications.map(n => ({ ...n, isRead: true }));
      setNotifications(updated);
      localStorage.setItem('demo_notifs', JSON.stringify(updated));
    }
  };

  // Log user actions (Read FAQ, Ask Yaksha, etc.)
  const triggerActivity = async (action: string, faqId?: string) => {
    try {
      const res = await fetch('/api/user/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, faqId }),
      });
      if (res.ok) {
        await Promise.all([refetchUser(), refreshSpurti(), refreshNotifications()]);
      } else {
        throw new Error();
      }
    } catch (e) {
      if (user) {
        let xpEarned = 5;
        let actName = action;
        if (action.startsWith('Read FAQ')) {
          xpEarned = 5;
          actName = faqId ? `Read FAQ: ${faqId}` : action;
        } else if (action === 'Ask Yaksha') {
          xpEarned = 10;
        } else if (action.includes('Vote')) {
          xpEarned = 2;
        } else if (action.includes('Bookmark')) {
          xpEarned = 3;
        }

        const newPoints = user.spurtiPoints + xpEarned;
        const badges = [...user.badges];
        
        if (action.includes('Bookmark') && !badges.includes('Bookworm') && newPoints > 100) {
          badges.push('Bookworm');
        }
        if (action === 'Ask Yaksha' && !badges.includes("Yaksha's Favorite")) {
          badges.push("Yaksha's Favorite");
        }

        const updatedUser = {
          ...user,
          spurtiPoints: newPoints,
          badges
        };
        setUser(updatedUser);
        localStorage.setItem('demo_user', JSON.stringify(updatedUser));

        const logs = JSON.parse(localStorage.getItem('demo_logs') || '[]');
        logs.unshift({
          id: `log-${Date.now()}`,
          action: actName,
          xpEarned,
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('demo_logs', JSON.stringify(logs.slice(0, 15)));

        const notifs = [...notifications];
        notifs.unshift({
          id: `notif-${Date.now()}`,
          message: `Local Action logged: ${actName}. Earned +${xpEarned} SP.`,
          isRead: false,
          createdAt: new Date().toISOString()
        });
        setNotifications(notifs);
        localStorage.setItem('demo_notifs', JSON.stringify(notifs));

        await refreshSpurti();
      }
    }
  };

  // Load user details on initial render
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await refetchUser();
      setIsLoading(false);
    };
    init();
  }, []);

  // Sync Spurti and notifications when user logs in
  useEffect(() => {
    if (user) {
      refreshSpurti();
      refreshNotifications();

      const interval = setInterval(() => {
        refreshNotifications();
        refreshSpurti();
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setSpurti(null);
      setNotifications([]);
    }
  }, [user]);

  // LOGIN action
  const login = async (email: string, password: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed.');
      }
      setUser(data.user);
    } catch (e: any) {
      console.warn('Backend API login failed. Accessing local user demo profile:', e);
      const isAdmin = email.toLowerCase().includes('admin');
      const mockUser: User = {
        id: `demo-${Date.now()}`,
        name: isAdmin ? 'Yaksha Admin' : 'Scholar Intern',
        email,
        role: isAdmin ? 'ADMIN' : 'USER',
        spurtiPoints: isAdmin ? 1200 : 75,
        streak: 3,
        badges: isAdmin 
          ? ['First Question', 'Bookworm', 'Yaksha\'s Favorite', 'FAQ Hunter'] 
          : ['First Question'],
      };
      setUser(mockUser);
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
    }
  };

  // REGISTER action
  const register = async (name: string, email: string, password: string, studentId?: string, college?: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, studentId, college }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }
      setUser(data.user);
    } catch (e: any) {
      console.warn('Backend API registration failed. Registering mock user locally:', e);
      const mockUser: User = {
        id: `demo-${Date.now()}`,
        name,
        email,
        role: 'USER',
        spurtiPoints: 20,
        streak: 1,
        badges: ['First Question'],
        college,
        studentId,
      };
      setUser(mockUser);
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
    }
  };

  // LOGOUT action
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Server offline during logout. Logging out locally.');
    }
    setUser(null);
    setSpurti(null);
    setNotifications([]);
    localStorage.removeItem('demo_user');
    localStorage.removeItem('demo_logs');
    localStorage.removeItem('demo_notifs');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        spurti,
        notifications,
        login,
        register,
        logout,
        triggerActivity,
        refreshSpurti,
        refreshNotifications,
        markNotificationsRead,
        refetchUser,
        errorMsg,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
