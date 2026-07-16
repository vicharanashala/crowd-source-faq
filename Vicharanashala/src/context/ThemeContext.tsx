import React, { createContext, useContext, useEffect } from 'react';

interface ThemeContextType {
  theme: 'dark';
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark' });

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    // Force dark mode classes on HTML element
    const root = window.document.documentElement;
    root.classList.add('dark');
    root.style.backgroundColor = '#050510';
    root.style.color = '#e2e8f0';
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'dark' }}>
      <div className="min-h-screen bg-[#050510] text-[#e2e8f0] font-sans antialiased overflow-x-hidden relative">
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
