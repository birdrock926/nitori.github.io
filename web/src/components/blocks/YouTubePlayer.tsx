import { useEffect, useRef, useState } from 'react';

type Props = {
  videoId: string;
  title?: string;
};

const YouTubePlayer = ({ videoId, title }: Props) => {
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

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;

  return (
    <div ref={ref} style={{ position: 'relative', paddingTop: '56.25%', borderRadius: '1rem', overflow: 'hidden' }}>
      {isVisible ? (
        <iframe
          src={embedUrl}
          title={title ?? 'YouTube 動画'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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

export default YouTubePlayer;
