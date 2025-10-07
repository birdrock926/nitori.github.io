import type { HeaderBiddingUnit } from '@config/site';

declare global {
  interface Window {
    pbjs: any;
    googletag: any;
    __hbState?: {
      initialized: boolean;
      slots: Record<string, any>;
      registered: Set<string>;
    };
  }
}

const ensureGlobalState = () => {
  if (typeof window === 'undefined') return undefined;
  if (!window.__hbState) {
    window.__hbState = {
      initialized: false,
      slots: {},
      registered: new Set<string>(),
    };
  }
  return window.__hbState;
};

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
          once: true,
        });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.type = 'text/javascript';
    script.dataset.loaded = 'false';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
    document.head.appendChild(script);
  });

let bootPromise: Promise<void> | null = null;

const ensureLibraries = async () => {
  if (typeof window === 'undefined') return;
  if (!bootPromise) {
    bootPromise = (async () => {
      const state = ensureGlobalState();
      if (!state) return;
      window.pbjs = window.pbjs || { que: [] };
      window.googletag = window.googletag || { cmd: [] };
      await Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/prebid.js@8.44.0/dist/prebid.min.js'),
        loadScript('https://securepubads.g.doubleclick.net/tag/js/gpt.js'),
      ]);
      window.googletag.cmd.push(() => {
        if (!state.initialized) {
          window.googletag.pubads().disableInitialLoad();
          window.googletag.enableServices();
          state.initialized = true;
        }
      });
    })();
  }
  await bootPromise;
};

export type HeaderBiddingOptions = {
  elementId: string;
  unit: HeaderBiddingUnit;
  timeoutMs: number;
  networkCode: string;
  adUnitPrefix?: string;
};

const buildSlotPath = (networkCode: string, adUnitPrefix: string | undefined, code: string) => {
  const trimmedPrefix = adUnitPrefix?.trim();
  if (trimmedPrefix) {
    return `${trimmedPrefix.replace(/\/$/, '')}/${code}`;
  }
  const normalizedNetwork = networkCode.replace(/^\/+/, '');
  return `/${normalizedNetwork}/${code}`;
};

export const mountHeaderBiddingSlot = async ({
  elementId,
  unit,
  timeoutMs,
  networkCode,
  adUnitPrefix,
}: HeaderBiddingOptions) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (!networkCode || !unit || !unit.code) {
    console.warn('[ads] Header bidding skipped due to missing configuration');
    return;
  }
  await ensureLibraries();
  const state = ensureGlobalState();
  if (!state) return;

  const slotPath = buildSlotPath(networkCode, adUnitPrefix, unit.code);

  window.googletag.cmd.push(() => {
    if (!state.slots[unit.code]) {
      const slot = window.googletag
        .defineSlot(slotPath, unit.mediaTypes.banner.sizes, elementId)
        .addService(window.googletag.pubads());
      state.slots[unit.code] = slot;
    }
  });

  window.pbjs.que.push(() => {
    if (!state.registered.has(unit.code)) {
      window.pbjs.addAdUnits([unit]);
      state.registered.add(unit.code);
    }
    window.pbjs.requestBids({
      adUnitCodes: [unit.code],
      timeout: timeoutMs,
      bidsBackHandler: () => {
        window.pbjs.setTargetingForGPTAsync([unit.code]);
        window.googletag.cmd.push(() => {
          try {
            window.googletag.display(elementId);
            const slot = state.slots[unit.code];
            if (slot) {
              window.googletag.pubads().refresh([slot]);
            } else {
              window.googletag.pubads().refresh();
            }
          } catch (error) {
            console.warn('[ads] GPT display error', error);
          }
        });
      },
    });
  });
};
