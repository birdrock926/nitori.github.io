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

export const ADSENSE = {
  clientId: import.meta.env.ADSENSE_CLIENT_ID ?? '',
  slots: {
    inArticle: import.meta.env.ADSENSE_SLOT_IN_ARTICLE ?? '',
    feed: import.meta.env.ADSENSE_SLOT_FEED ?? '',
    related: import.meta.env.ADSENSE_SLOT_RELATED ?? '',
  },
};

type PrebidBid = { bidder: string; params: Record<string, unknown> };

export type HeaderBiddingUnit = {
  code: string;
  mediaTypes: { banner: { sizes: [number, number][] } };
  bids: PrebidBid[];
  labelAny?: string[];
  labelAll?: string[];
  targeting?: Record<string, string | string[]>;
};

const parseJson = <T>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed as T;
  } catch (error) {
    console.warn('[config] Failed to parse JSON env value', error);
    return fallback;
  }
};

const defaultHeaderBiddingUnits: HeaderBiddingUnit[] = [
  {
    code: 'in-article',
    mediaTypes: { banner: { sizes: [[300, 250], [336, 280], [728, 90]] } },
    bids: [{ bidder: 'appnexus', params: { placementId: '12345678' } }],
  },
  {
    code: 'feed',
    mediaTypes: { banner: { sizes: [[300, 250], [320, 50], [320, 100]] } },
    bids: [{ bidder: 'rubicon', params: { accountId: '1234', siteId: '5678', zoneId: '9012' } }],
  },
  {
    code: 'related',
    mediaTypes: { banner: { sizes: [[300, 250], [336, 280]] } },
    bids: [{ bidder: 'openx', params: { unit: '123456789', delDomain: 'example-d.openx.net' } }],
  },
];

const rawUnits = parseJson<HeaderBiddingUnit[]>(
  import.meta.env.PUBLIC_ADS_HEADER_BIDDING_UNITS,
  defaultHeaderBiddingUnits
);

const normalizeUnits = (units: HeaderBiddingUnit[]): HeaderBiddingUnit[] =>
  units
    .filter((unit) => unit && typeof unit.code === 'string')
    .map((unit) => ({
      ...unit,
      mediaTypes: {
        banner: {
          sizes: Array.isArray(unit.mediaTypes?.banner?.sizes)
            ? unit.mediaTypes.banner.sizes
                .map((size) =>
                  Array.isArray(size) && size.length === 2
                    ? [Number(size[0]) || 0, Number(size[1]) || 0]
                    : null
                )
                .filter((size): size is [number, number] => Boolean(size && size[0] > 0 && size[1] > 0))
            : [[300, 250]],
        },
      },
      bids: Array.isArray(unit.bids) ? unit.bids.filter((bid) => bid && bid.bidder) : [],
    }))
    .filter((unit) => unit.bids.length > 0);

const headerBiddingEnabled = (import.meta.env.PUBLIC_ADS_HEADER_BIDDING_ENABLED ?? 'false')
  .toString()
  .toLowerCase() === 'true';

export const HEADER_BIDDING = {
  enabled: headerBiddingEnabled,
  timeoutMs: Number(import.meta.env.PUBLIC_ADS_HEADER_BIDDING_TIMEOUT_MS ?? 1200) || 1200,
  adUnits: normalizeUnits(rawUnits),
  gpt: {
    networkCode: import.meta.env.PUBLIC_ADS_GPT_NETWORK_CODE ?? '',
    adUnitPrefix: import.meta.env.PUBLIC_ADS_GPT_AD_UNIT_PREFIX ?? '',
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

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const sanitizeDefaultAuthorName = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '名無しのユーザーさん';
};

export const COMMENTS = {
  enabled: parseBoolean(import.meta.env.PUBLIC_COMMENTS_ENABLED, true),
  requireApproval: parseBoolean(import.meta.env.PUBLIC_COMMENTS_REQUIRE_APPROVAL, true),
  pageSize: parsePositiveInteger(import.meta.env.PUBLIC_COMMENTS_PAGE_SIZE, 50),
  maxLength: parsePositiveInteger(import.meta.env.PUBLIC_COMMENTS_MAX_LENGTH, 1200),
  defaultAuthorName: sanitizeDefaultAuthorName(import.meta.env.PUBLIC_COMMENTS_DEFAULT_AUTHOR),
};
