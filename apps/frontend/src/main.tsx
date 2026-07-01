// Core React imports required to render the application to the DOM
import React from 'react';
import ReactDOM from 'react-dom/client';

// Import the root App component (which contains your routing) and global CSS
import App from './App';
import './styles/index.css';

// 1. Locate the empty '<div id="root"></div>' in your public/index.html file
// 2. Initialize the modern React 18 concurrent rendering engine
ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode highlights potential problems by double-rendering components in development mode
  <React.StrictMode>
    <App />
  </React.StrictMode>
);