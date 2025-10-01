export const SITE_TITLE = 'ゲームニュース速報';
export const SITE_DESCRIPTION = 'ゲームニュースと配信をまとめて高速に届けるメディア';
export const SITE_URL = import.meta.env.SITE_URL || 'https://example.github.io';
export const DEFAULT_LOCALE = 'ja-JP';
export const TIMEZONE = 'Asia/Tokyo';
export const COMMENT_PAGE_SIZE = 20;

export const ADSENSE = {
  clientId: import.meta.env.ADSENSE_CLIENT_ID ?? '',
  slots: {
    inArticle: import.meta.env.ADSENSE_SLOT_IN_ARTICLE ?? '',
    feed: import.meta.env.ADSENSE_SLOT_FEED ?? '',
  },
};

export const GA = {
  measurementId: import.meta.env.GA_MEASUREMENT_ID ?? '',
};

export const STRAPI = {
  url: import.meta.env.STRAPI_API_URL ?? '',
  token: import.meta.env.STRAPI_API_TOKEN ?? '',
};

export const CONSENT_DEFAULT_REGION = import.meta.env.CONSENT_DEFAULT_REGION ?? 'JP';
