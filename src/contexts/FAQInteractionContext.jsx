/**
 * FAQInteractionContext.jsx — Per-user FAQ interaction state
 * 
 * Manages likes, dislikes, bookmarks, views — all scoped to the logged-in user.
 * Every action records full user metadata via services.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import * as faqService from '../services/faqService';
import * as analyticsService from '../services/analyticsService';

const FAQInteractionContext = createContext({
  likeFAQ: () => {},
  dislikeFAQ: () => {},
  bookmarkFAQ: () => {},
  unbookmarkFAQ: () => {},
  viewFAQ: () => {},
  getUserVote: () => null,
  isBookmarked: () => false,
  userBookmarks: [],
  refreshInteractions: () => {},
  interactionVersion: 0,
});

export const useFAQInteractions = () => useContext(FAQInteractionContext);

export function FAQInteractionProvider({ children }) {
  const { currentUser, isLoggedIn } = useAuth();
  // Bump version to trigger re-renders when interactions change
  const [interactionVersion, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const userMeta = useCallback(() => ({
    userId: currentUser?.id,
    userName: currentUser?.name,
    email: currentUser?.email,
  }), [currentUser]);

  const likeFAQ = useCallback((faqId, category, question) => {
    if (!isLoggedIn) return;
    const meta = userMeta();
    faqService.recordLike({ ...meta, faqId, category, question });
    analyticsService.logActivity({
      ...meta, action: 'like', faqId, category, question, interactionType: 'like',
    });
    bump();
  }, [isLoggedIn, userMeta, bump]);

  const dislikeFAQ = useCallback((faqId, category, question) => {
    if (!isLoggedIn) return;
    const meta = userMeta();
    faqService.recordDislike({ ...meta, faqId, category, question });
    analyticsService.logActivity({
      ...meta, action: 'dislike', faqId, category, question, interactionType: 'dislike',
    });
    bump();
  }, [isLoggedIn, userMeta, bump]);

  const bookmarkFAQ = useCallback((faqId, category, question) => {
    if (!isLoggedIn) return;
    const meta = userMeta();
    faqService.recordBookmark({ ...meta, faqId, category, question });
    analyticsService.logActivity({
      ...meta, action: 'bookmark', faqId, category, question, interactionType: 'bookmark',
    });
    bump();
  }, [isLoggedIn, userMeta, bump]);

  const unbookmarkFAQ = useCallback((faqId) => {
    if (!isLoggedIn) return;
    faqService.removeBookmark(currentUser.id, faqId);
    bump();
  }, [isLoggedIn, currentUser, bump]);

  const viewFAQ = useCallback((faqId, category, question) => {
    if (!isLoggedIn) return;
    const meta = userMeta();
    faqService.recordView({ ...meta, faqId, category, question });
    analyticsService.logActivity({
      ...meta, action: 'view_faq', faqId, category, question, interactionType: 'view',
    });
    bump();
  }, [isLoggedIn, userMeta, bump]);

  const getUserVote = useCallback((faqId) => {
    if (!isLoggedIn || !currentUser) return null;
    return faqService.getUserVote(currentUser.id, faqId);
  }, [isLoggedIn, currentUser, interactionVersion]); // eslint-disable-line

  const checkBookmarked = useCallback((faqId) => {
    if (!isLoggedIn || !currentUser) return false;
    return faqService.isBookmarked(currentUser.id, faqId);
  }, [isLoggedIn, currentUser, interactionVersion]); // eslint-disable-line

  const userBookmarks = isLoggedIn && currentUser
    ? faqService.getUserBookmarks(currentUser.id)
    : [];

  const value = {
    likeFAQ,
    dislikeFAQ,
    bookmarkFAQ,
    unbookmarkFAQ,
    viewFAQ,
    getUserVote,
    isBookmarked: checkBookmarked,
    userBookmarks,
    refreshInteractions: bump,
    interactionVersion,
  };

  return (
    <FAQInteractionContext.Provider value={value}>
      {children}
    </FAQInteractionContext.Provider>
  );
}
