/**
 * UserProfileContext.jsx — Per-user profile data
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import * as faqService from '../services/faqService';
import * as searchService from '../services/searchService';
import * as queryService from '../services/queryService';
import * as feedbackService from '../services/feedbackService';
import { useFAQInteractions } from './FAQInteractionContext';

const UserProfileContext = createContext({ profile: null });

export const useUserProfile = () => useContext(UserProfileContext);

export function UserProfileProvider({ children }) {
  const { currentUser, isLoggedIn } = useAuth();
  // Subscribe to interaction changes so profile updates
  const { interactionVersion } = useFAQInteractions();

  const profile = useMemo(() => {
    if (!isLoggedIn || !currentUser) return null;

    const userId = currentUser.id;

    return {
      ...currentUser,
      bookmarks: faqService.getUserBookmarks(userId),
      likes: faqService.getUserLikes(userId),
      dislikes: faqService.getUserDislikes(userId),
      searchHistory: searchService.getSearchHistory(userId),
      questionsAsked: queryService.getUserQueries(userId),
      feedbackSubmitted: feedbackService.getUserFeedback(userId),
      stats: {
        bookmarkCount: faqService.getUserBookmarks(userId).length,
        likeCount: faqService.getUserLikes(userId).length,
        dislikeCount: faqService.getUserDislikes(userId).length,
        searchCount: searchService.getSearchHistory(userId).length,
        queryCount: queryService.getUserQueries(userId).length,
        feedbackCount: feedbackService.getUserFeedback(userId).length,
      },
    };
  }, [currentUser, isLoggedIn, interactionVersion]);

  return (
    <UserProfileContext.Provider value={{ profile }}>
      {children}
    </UserProfileContext.Provider>
  );
}
