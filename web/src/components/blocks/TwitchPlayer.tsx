import { useEffect, useMemo, useRef, useState } from 'react';

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
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      });
    }, { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const src = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams({
      parent: window.location.hostname,
      autoplay: 'false',
      muted: 'true',
    });
    if (channel) params.set('channel', channel);
    if (vodId) params.set('video', vodId);
    return `https://player.twitch.tv/?${params.toString()}`;
  }, [channel, vodId]);

  return (
    <div ref={ref} style={{ position: 'relative', paddingTop: '56.25%', borderRadius: '1rem', overflow: 'hidden' }}>
      {isVisible && src ? (
        <iframe
          src={src}
          title={title ?? 'Twitch Player'}
          allowFullScreen
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
          読み込み中…
        </div>
      )}
    </div>
  );
};

export default TwitchPlayer;
