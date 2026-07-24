// Core React imports required to render the application to the DOM
import React from 'react';
import ReactDOM from 'react-dom/client';

// Import the root App component (which contains your routing) and global CSS
import App from './App';
import './styles/index.css';

// samagama.in SSO bridge: mirror the yaksha_session cookie (set by
// samagama.in's auth flow after they hit /api/auth/bridge/exchange)
// into localStorage so the existing AuthContext picks it up. Runs
// before React renders so the first AuthContext read is hydrated.
import { syncBridgeCookieToLocalStorage } from './auth/cookieBridge';
syncBridgeCookieToLocalStorage();

// 1. Locate the empty '<div id="root"></div>' in your public/index.html file
// 2. Initialize the modern React 18 concurrent rendering engine
ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode highlights potential problems by double-rendering components in development mode
  <React.StrictMode>
    <App />
  </React.StrictMode>
);