import { useEffect, useState } from 'react';

const ThemeToggle = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return (document.documentElement.dataset.theme as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const label = theme === 'light' ? '🌙 ダークに切替' : '🌞 ライトに切替';

  return (
    <button
      type="button"
      aria-pressed={theme === 'dark'}
      aria-label={label}
      className="ghost-button theme-toggle-button"
      onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
    >
      {theme === 'light' ? '🌙 ダーク' : '🌞 ライト'}
    </button>
  );
};

export default ThemeToggle;
