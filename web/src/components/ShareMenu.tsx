import { useCallback, useMemo, useState } from 'react';

type Props = {
  url: string;
  title: string;
};

const buildTweetUrl = (url: string, title: string) => {
  const endpoint = new URL('https://twitter.com/intent/tweet');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('text', `【気になったニュースまとめブログ】${title}`);
  return endpoint.toString();
};

const ShareMenu = ({ url, title }: Props) => {
  const [copied, setCopied] = useState(false);
  const tweetHref = useMemo(() => buildTweetUrl(url, title), [url, title]);

  const shareText = useMemo(() => `${title}\n${url}`, [title, url]);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareText;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn('[share] copy failed', error);
      alert('リンクをコピーできませんでした。手動でコピーしてください。');
    }
  }, [shareText]);

  return (
    <div className="share-menu" role="group" aria-label="記事を共有">
      <button type="button" className="ghost-button ghost-button--icon" onClick={handleCopy}>
        <span className="ghost-button__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </span>
        <span className="ghost-button__label">コピー</span>
      </button>
      <a className="ghost-button ghost-button--icon" href={tweetHref} target="_blank" rel="noopener noreferrer">
        <span className="ghost-button__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" role="presentation">
            <path d="M21.54 6.07a5.76 5.76 0 0 1-1.64.45 2.86 2.86 0 0 0 1.26-1.58 5.7 5.7 0 0 1-1.82.7 2.87 2.87 0 0 0-4.88 2.62A8.13 8.13 0 0 1 4.52 4.7a2.87 2.87 0 0 0 .89 3.83 2.83 2.83 0 0 1-1.3-.36v.04a2.87 2.87 0 0 0 2.3 2.82 2.87 2.87 0 0 1-1.29.05 2.87 2.87 0 0 0 2.68 1.99A5.76 5.76 0 0 1 3 15.26a8.13 8.13 0 0 0 12.5-6.85c0-.12 0-.24-.01-.35a5.81 5.81 0 0 0 1.43-1.99z" />
          </svg>
        </span>
        <span className="ghost-button__label">Xで共有</span>
      </a>
      <div className="share-menu__status" aria-live="polite" role="status">
        {copied ? 'リンクをコピーしました' : ''}
      </div>
    </div>
  );
};

export default ShareMenu;
