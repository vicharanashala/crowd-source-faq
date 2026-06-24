/**
 * usePageTracker.js — Track page visits per user
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import * as analyticsService from '../services/analyticsService';
import * as userService from '../services/userService';

export function usePageTracker() {
  const location = useLocation();
  const { currentUser, isLoggedIn } = useAuth();

  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    analyticsService.logActivity({
      userId: currentUser.id,
      userName: currentUser.name,
      email: currentUser.email,
      action: 'page_visit',
      page: location.pathname,
      interactionType: 'navigation',
    });

    userService.updateLastActive(currentUser.id);
  }, [location.pathname, isLoggedIn, currentUser]);
}
