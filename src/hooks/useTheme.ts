import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
const LS_THEME = 'mnemonic-brc100-theme';

/** Light by default, like the BitcoinSV Wallet; a saved choice wins. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(LS_THEME);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked */ }
  return 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101114' : '#f4f2f0');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(LS_THEME, next); } catch { /* storage blocked */ }
      return next;
    });
  }, []);
  return { theme, toggle };
}
