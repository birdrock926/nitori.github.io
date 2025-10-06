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
    container?: string;
  }

  interface Remark42Global {
    createInstance: (options: Remark42CreateOptions) => void;
    destroy?: () => void;
  }

  interface Window {
    REMARK42?: Remark42Global;
  }
}

type Remark42WidgetProps = {
  slug: string;
  title: string;
  url: string;
};

const normalizeTheme = (value?: string | null): Theme => (value === 'dark' ? 'dark' : 'light');

const loadScript = (host: string, siteId: string, onLoad: () => void) => {
  const scriptId = 'remark42-embed-script';
  const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

  if (existing) {
    if (window.REMARK42) {
      onLoad();
    } else {
      existing.addEventListener('load', onLoad, { once: true });
    }
    return;
  }

  const script = document.createElement('script');
  script.id = scriptId;
  script.async = true;
  script.src = `${host.replace(/\/$/, '')}/web/embed.js`;
  script.dataset.siteId = siteId;
  script.addEventListener('load', onLoad);
  script.addEventListener('error', () => {
    console.error('[remark42] Failed to load embed script.');
  });
  document.body.appendChild(script);
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

    const render = () => {
      if (!window.REMARK42) {
        console.warn('[remark42] Global instance is not ready yet.');
        return;
      }

      try {
        window.REMARK42.destroy?.();
      } catch (error) {
        console.debug('[remark42] Failed to destroy previous instance', error);
      }

      window.REMARK42.createInstance({
        host,
        site_id: siteId,
        components: ['embed'],
        url,
        title,
        page_title: title,
        theme,
        locale,
        container: container.id,
      });
    };

    loadScript(host, siteId, render);

    return () => {
      try {
        window.REMARK42?.destroy?.();
      } catch (error) {
        console.debug('[remark42] Failed to teardown instance', error);
      }
    };
  }, [host, siteId, url, title, theme, locale, containerId]);

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
      <div id={containerId} ref={containerRef} className="remark42-widget" data-title={title} />
    </section>
  );
};

export default Remark42Widget;
