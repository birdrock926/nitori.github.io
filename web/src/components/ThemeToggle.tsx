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

  return (
    <button
      type="button"
      aria-pressed={theme === 'dark'}
      onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
      style={{
        background: 'transparent',
        border: '1px solid var(--color-border)',
        borderRadius: '999px',
        padding: '0.35rem 0.9rem',
        cursor: 'pointer',
      }}
    >
      {theme === 'light' ? '🌞 ライト' : '🌙 ダーク'}
    </button>
  );
};

export default ThemeToggle;
