import { useEffect } from 'react';

const MIN_SCROLL_TO_HIDE = 120;
const SCROLL_DELTA = 6;

const toggleHidden = (header: HTMLElement, hidden: boolean) => {
  header.classList.toggle('is-hidden', hidden);
};

export default function HeaderBehavior() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site-header');
    if (!header) {
      return;
    }

    let lastY = window.scrollY;
    let hidden = false;
    let ticking = false;

    const update = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastY;

      if (currentY <= MIN_SCROLL_TO_HIDE) {
        if (hidden) {
          hidden = false;
          toggleHidden(header, hidden);
        }
      } else if (delta > SCROLL_DELTA && !hidden) {
        hidden = true;
        toggleHidden(header, hidden);
      } else if (delta < -SCROLL_DELTA && hidden) {
        hidden = false;
        toggleHidden(header, hidden);
      }

      lastY = currentY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return null;
}
