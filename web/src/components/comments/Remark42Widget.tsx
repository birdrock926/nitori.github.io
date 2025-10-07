import { useEffect, useMemo, useRef, useState } from 'react';
import { REMARK42 } from '@config/site';

type Theme = 'light' | 'dark';

declare global {
  interface Remark42CreateOptions {
    host: string;
    site_id: string;
    components: string[];
    url: string;
    title?: string;
    page_title?: string;
    theme?: string;
    locale?: string;
    node?: HTMLElement;
  }

  interface Remark42Global {
    createInstance: (options: Remark42CreateOptions) => void;
    destroy?: () => void;
    changeTheme?: (theme: string) => void;
  }

  interface Window {
    REMARK42?: Remark42Global;
    remark_config?: Remark42CreateOptions;
  }
}

type Remark42WidgetProps = {
  slug: string;
  title: string;
  url: string;
};

const normalizeTheme = (value?: string | null): Theme => (value === 'dark' ? 'dark' : 'light');

const getScript = (host: string, onLoad: () => void) => {
  const scriptId = 'remark42-embed-script';
  const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

  if (existing) {
    if (window.REMARK42) {
      onLoad();
    } else {
      existing.addEventListener('load', onLoad, { once: true });
    }
    return existing;
  }

  const script = document.createElement('script');
  script.id = scriptId;
  script.async = true;
  script.defer = true;
  script.dataset.noInstant = 'true';
  script.src = `${host.replace(/\/$/, '')}/web/embed.js`;
  script.addEventListener('load', onLoad, { once: true });
  script.addEventListener('error', () => {
    console.error('[remark42] Failed to load embed script.');
  });
  document.body.appendChild(script);
  return script;
};

const ensureInstance = (
  container: HTMLElement,
  config: Remark42CreateOptions,
  theme: Theme
) => {
  if (!window.REMARK42) {
    console.warn('[remark42] Global instance is not ready yet.');
    return;
  }

  try {
    window.REMARK42.destroy?.();
  } catch (error) {
    console.debug('[remark42] Failed to destroy previous instance', error);
  }

  window.remark_config = config;
  container.innerHTML = '';
  window.REMARK42.createInstance({ ...config, node: container });

  if (window.REMARK42.changeTheme) {
    try {
      window.REMARK42.changeTheme(theme);
    } catch (error) {
      console.debug('[remark42] Failed to apply theme', error);
    }
  }
};

const Remark42Widget = ({ slug, title, url }: Remark42WidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'light';
    return normalizeTheme(document.documentElement.dataset.theme);
  });

  const containerId = useMemo(() => `remark42-${slug.replace(/[^a-zA-Z0-9-_]/g, '-') || 'thread'}`, [slug]);
  const host = REMARK42.host?.replace(/\/$/, '');
  const siteId = REMARK42.siteId?.trim();
  const locale = REMARK42.locale ?? 'ja';

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: string }>).detail;
      if (detail?.theme) {
        setTheme(normalizeTheme(detail.theme));
      }
    };

    document.addEventListener('themechange', listener as EventListener);
    return () => document.removeEventListener('themechange', listener as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!host || !siteId) {
      console.warn('[remark42] Host or site ID is not configured.');
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const config: Remark42CreateOptions = {
      host,
      site_id: siteId,
      components: ['embed'],
      url,
      title,
      page_title: title,
      theme,
      locale,
      node: container,
    };

    window.remark_config = config;

    container.setAttribute('data-remark-host', host);
    container.setAttribute('data-remark-site-id', siteId);
    container.setAttribute('data-remark-url', url);
    container.setAttribute('data-remark-title', title);
    container.setAttribute('data-remark-locale', locale);

    const loadHandler = () => ensureInstance(container, config, theme);
    const script = getScript(host, loadHandler);

    if (window.REMARK42) {
      ensureInstance(container, config, theme);
    }

    return () => {
      if (script) {
        script.removeEventListener('load', loadHandler);
      }

      try {
        window.REMARK42?.destroy?.();
      } catch (error) {
        console.debug('[remark42] Failed to teardown instance', error);
      }
    };
  }, [host, siteId, url, title, theme, locale, slug]);

  if (!host || !siteId) {
    return (
      <section className="card remark42-thread" aria-label="コメント">
        <h2>コメント</h2>
        <p className="muted">コメント機能は現在利用できません。管理者にお問い合わせください。</p>
      </section>
    );
  }

  return (
    <section className="card remark42-thread" aria-label="コメント">
      <h2>コメント</h2>
      <div
        id={containerId}
        ref={containerRef}
        className="remark42 remark42-widget"
        data-title={title}
        role="region"
        aria-live="polite"
      />
    </section>
  );
};

export default Remark42Widget;
