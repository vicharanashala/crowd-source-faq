import { createContext, useContext } from 'react';

export const AuthContext = createContext({
  currentUser: null,
  userRole: null,
  isLoggedIn: false,
  isAdmin: false,
  login: async () => {},
  signup: async () => {},
  adminLogin: async () => {},
  logout: () => {},
  openAuth: () => {},
  closeAuth: () => {},
  authOpen: false,
  pendingAction: null,
  setPendingAction: () => {},
});

export const useAuth = () => useContext(AuthContext);
