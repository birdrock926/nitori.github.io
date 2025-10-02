export const SITE_TITLE = 'ゲームニュース速報';
export const SITE_DESCRIPTION = 'ゲームニュースと配信をまとめて高速に届けるメディア';
export const SITE_URL = import.meta.env.SITE_URL || 'https://example.pages.dev';
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

export const DELETE_REQUEST = {
  formUrl:
    import.meta.env.DELETE_REQUEST_FORM_URL ??
    'https://docs.google.com/forms/d/REPLACE_WITH_FORM_ID/viewform',
};

const twitchHosts = (import.meta.env.PUBLIC_TWITCH_PARENT_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export const STRAPI = {
  url: import.meta.env.STRAPI_API_URL ?? '',
  token: import.meta.env.STRAPI_API_TOKEN ?? '',
  mediaUrl: import.meta.env.STRAPI_MEDIA_URL ?? import.meta.env.STRAPI_API_URL ?? '',
};

export const TWITCH = {
  parentHosts: twitchHosts,
};

export const CONSENT_DEFAULT_REGION = import.meta.env.CONSENT_DEFAULT_REGION ?? 'JP';
