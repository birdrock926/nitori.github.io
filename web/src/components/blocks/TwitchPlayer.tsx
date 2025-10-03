import { useEffect, useMemo, useRef, useState } from 'react';
import { getTwitchParentHosts } from '@lib/strapi';

type Props = {
  channel?: string;
  vodId?: string;
  title?: string;
};

const TwitchPlayer = ({ channel, vodId, title }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const src = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams({
      autoplay: 'false',
      muted: 'true',
    });
    const parents = getTwitchParentHosts();
    parents.forEach((host) => params.append('parent', host));
    if (channel) params.set('channel', channel);
    if (vodId) params.set('video', vodId);
    return `https://player.twitch.tv/?${params.toString()}`;
  }, [channel, vodId]);

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div
        ref={ref}
        style={{
          position: 'relative',
          paddingTop: '56.25%',
          width: '100%',
          maxWidth: '720px',
          borderRadius: '1rem',
          overflow: 'hidden',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.18)',
        }}
        aria-live="polite"
      >
        {isVisible && src ? (
          <iframe
            src={src}
            title={title ?? 'Twitchプレイヤー'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: '0' }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.1)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--color-muted)',
            }}
          >
            Twitchプレイヤーを読み込み中…
          </div>
        )}
      </div>
    </div>
  );
};

export default TwitchPlayer;
