import { useEffect, useState } from 'react';

const SunIcon = () => (
  <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
    <path
      d="M12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Zm0-5.2 1.1 3.4h-2.2L12 2Zm0 20 1.1-3.4h-2.2L12 22Zm11-8.8-3.4-1.1v2.2L23 13.2Zm-20 0L.6 12l3.4-1.1v2.2ZM19.4 5l-2.4 2.4-1.6-1.6L17.8 3.3 19.4 5Zm-11.4 9.4L5.6 17l-1.6-1.6 2.4-2.4 1.6 1.6Zm11.4 2.6 1.6 1.6-2.4 2.4-1.6-1.6 2.4-2.4Zm-13-13L5.4 3.4 3 5.8l1.6 1.6 2.4-2.4Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
    <path
      d="M20.5 13.6a7.5 7.5 0 0 1-9.2-9.2 9 9 0 1 0 9.2 9.2Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

const ThemeToggle = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = localStorage.getItem('theme');
    const preferred =
      stored === 'dark' || stored === 'light'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';

    document.documentElement.dataset.theme = preferred;
    setTheme(preferred);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }, [theme, hydrated]);

  const displayTheme = hydrated ? theme : 'light';
  const isDark = displayTheme === 'dark';

  return (
    <button
      type="button"
      aria-pressed={isDark}
      aria-label={`テーマを${isDark ? 'ライト' : 'ダーク'}に切り替え`}
      className="ghost-button ghost-button--icon theme-toggle"
      onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
    >
      <span className="ghost-button__icon" aria-hidden="true">
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
      <span className="ghost-button__label">{isDark ? 'ライト' : 'ダーク'}</span>
    </button>
  );
};

export default ThemeToggle;
