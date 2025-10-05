export const SITE_TITLE = '気になったニュースまとめブログ';
export const SITE_DESCRIPTION = '気になった話題を素早くキャッチできるニュース＆配信まとめブログ';
const sanitizePlaceholderUrl = (value: string | undefined | null, fallback: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const placeholderPatterns = [/example\.com/i, /example\.pages\.dev/i, /namespace\/b\/bucket/i];
  if (placeholderPatterns.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }
  return trimmed;
};

export const SITE_URL =
  sanitizePlaceholderUrl(import.meta.env.SITE_URL, 'https://example.pages.dev') ||
  'https://example.pages.dev';
export const DEFAULT_LOCALE = 'ja-JP';
export const TIMEZONE = 'Asia/Tokyo';
export const COMMENT_PAGE_SIZE = 20;

export const ADSENSE = {
  clientId: import.meta.env.ADSENSE_CLIENT_ID ?? '',
  slots: {
    inArticle: import.meta.env.ADSENSE_SLOT_IN_ARTICLE ?? '',
    feed: import.meta.env.ADSENSE_SLOT_FEED ?? '',
    related: import.meta.env.ADSENSE_SLOT_RELATED ?? '',
  },
};

export const GA = {
  measurementId: import.meta.env.GA_MEASUREMENT_ID ?? '',
};

export const DELETE_REQUEST = {
  formUrl:
    import.meta.env.DELETE_REQUEST_FORM_URL ??
    'https://docs.google.com/forms/d/REPLACE_WITH_FORM_ID/viewform',
};

type CaptchaProvider = 'none' | 'turnstile' | 'recaptcha';

const rawCaptchaProvider = (import.meta.env.PUBLIC_CAPTCHA_PROVIDER ?? 'none').toLowerCase();
const captchaProvider: CaptchaProvider =
  rawCaptchaProvider === 'turnstile' || rawCaptchaProvider === 'recaptcha'
    ? (rawCaptchaProvider as CaptchaProvider)
    : 'none';

export const CAPTCHA = {
  provider: captchaProvider,
  turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '',
  recaptchaSiteKey: import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY ?? '',
};

const twitchHosts = (import.meta.env.PUBLIC_TWITCH_PARENT_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

if (!twitchHosts.length) {
  twitchHosts.push('localhost');
}

const resolvedStrapiUrl = sanitizePlaceholderUrl(
  import.meta.env.STRAPI_API_URL,
  'http://localhost:1337'
);

const resolvedMediaUrl = sanitizePlaceholderUrl(
  import.meta.env.STRAPI_MEDIA_URL,
  resolvedStrapiUrl
);

export const STRAPI = {
  url: resolvedStrapiUrl,
  token: import.meta.env.STRAPI_API_TOKEN ?? '',
  mediaUrl: resolvedMediaUrl,
};

export const TWITCH = {
  parentHosts: twitchHosts,
};

export const CONSENT_DEFAULT_REGION = import.meta.env.CONSENT_DEFAULT_REGION ?? 'JP';
