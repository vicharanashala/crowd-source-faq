import React, { useState, useCallback, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import * as userService from '../services/userService';
import * as analyticsService from '../services/analyticsService';

const STORAGE_KEY = 'samagama_auth';
const ADMIN_EMAIL = 'admin123@gmail.com';
const ADMIN_PASSWORD = '1234567890';

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export default function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(loadStoredUser);
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const isLoggedIn = !!currentUser;
  const userRole = currentUser?.role || null;
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [currentUser]);

  const login = useCallback(async (email, password) => {
    // Mock — accept any non-empty credentials for students
    if (!email || !password) throw new Error('Email and password are required.');
    if (password.length < 4) throw new Error('Invalid credentials.');

    // Check if user already exists
    const existing = userService.getUserByEmail(email);
    let user;

    if (existing) {
      user = existing;
      userService.updateLastActive(existing.id);
    } else {
      user = {
        id: 'usr_' + Date.now(),
        name: email.split('@')[0],
        email,
        role: 'student',
        avatar: null,
        createdAt: new Date().toISOString(),
      };
      userService.registerUser(user);
    }

    setCurrentUser(user);

    analyticsService.logActivity({
      userId: user.id,
      userName: user.name,
      email: user.email,
      action: 'login',
      interactionType: 'auth',
    });

    return user;
  }, []);

  const signup = useCallback(async (name, email, password, confirmPassword) => {
    if (!name || !email || !password) throw new Error('All fields are required.');
    if (password !== confirmPassword) throw new Error('Passwords do not match.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');

    const user = {
      id: 'usr_' + Date.now(),
      name,
      email,
      role: 'student',
      avatar: null,
      createdAt: new Date().toISOString(),
    };

    userService.registerUser(user);

    setCurrentUser(user);

    analyticsService.logActivity({
      userId: user.id,
      userName: user.name,
      email: user.email,
      action: 'signup',
      interactionType: 'auth',
    });

    return user;
  }, []);

  const adminLogin = useCallback(async (email, password) => {
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      throw new Error('Invalid administrator credentials.');
    }
    const admin = {
      id: 'admin_001',
      name: 'Administrator',
      email: ADMIN_EMAIL,
      role: 'admin',
      avatar: null,
      createdAt: new Date().toISOString(),
    };
    setCurrentUser(admin);
    return admin;
  }, []);

  const logout = useCallback(() => {
    if (currentUser) {
      analyticsService.logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        email: currentUser.email,
        action: 'logout',
        interactionType: 'auth',
      });
    }
    setCurrentUser(null);
    setPendingAction(null);
  }, [currentUser]);

  const openAuth = useCallback((action = null) => {
    if (action) setPendingAction(() => action);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    setPendingAction(null);
  }, []);

  const value = {
    currentUser,
    userRole,
    isLoggedIn,
    isAdmin,
    login,
    signup,
    adminLogin,
    logout,
    openAuth,
    closeAuth,
    authOpen,
    pendingAction,
    setPendingAction,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
