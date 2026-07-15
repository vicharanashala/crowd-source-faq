import { useState, useEffect } from 'react';

/**
 * Returns whether the current theme is dark mode.
 * Observes the `data-theme` attribute on <html> via MutationObserver
 * so the value stays reactive when the user toggles themes.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') === 'dark'
      : false,
  );

  useEffect(() => {
    const el = document.documentElement;
    const check = () => setIsDark(el.getAttribute('data-theme') === 'dark');
    check();
    const observer = new MutationObserver(check);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
