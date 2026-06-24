/**
 * AppContext.jsx — Master context that composes all sub-contexts
 */

import React from 'react';
import { AlertProvider } from './AlertContext';
import { FAQInteractionProvider } from './FAQInteractionContext';
import { SearchProvider } from './SearchContext';
import { AnalyticsProvider } from './AnalyticsContext';
import { UserProfileProvider } from './UserProfileContext';

export default function AppProvider({ children }) {
  return (
    <AlertProvider>
      <FAQInteractionProvider>
        <SearchProvider>
          <AnalyticsProvider>
            <UserProfileProvider>
              {children}
            </UserProfileProvider>
          </AnalyticsProvider>
        </SearchProvider>
      </FAQInteractionProvider>
    </AlertProvider>
  );
}
