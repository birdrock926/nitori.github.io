import qs from 'qs';

const DEFAULT_COMMENT_LIMIT = 50;
const MAX_COMMENT_LIMIT = 200;
const COMMENT_LIMIT_ALIASES = [
  'limit',
  '_limit',
  'pageSize',
  'page_size',
  'pagination[limit]',
  'pagination[pageSize]',
  'pagination[page_size]',
];
const PAGINATION_KEYS = ['limit', 'pageSize', 'page_size'];

const coercePositiveInteger = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const clampLimit = (value, maximum) => {
  const parsed = coercePositiveInteger(value);
  if (parsed === null) {
    return null;
  }
  const safeMaximum = coercePositiveInteger(maximum) ?? MAX_COMMENT_LIMIT;
  return Math.min(Math.max(parsed, 1), safeMaximum);
};

const setQueryAliases = (query, limitValue) => {
  query.limit = limitValue;
  query._limit = limitValue;
  query.pageSize = limitValue;
  query.page_size = limitValue;

  const nextPagination =
    query.pagination && typeof query.pagination === 'object' ? query.pagination : {};
  nextPagination.limit = limitValue;
  nextPagination.pageSize = limitValue;
  nextPagination.page_size = limitValue;
  query.pagination = nextPagination;

  ['pagination[limit]', 'pagination[pageSize]', 'pagination[page_size]'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      delete query[key];
    }
  });
};

export const sanitizeCommentsLimit = (
  query,
  { fallback = DEFAULT_COMMENT_LIMIT, maximum = MAX_COMMENT_LIMIT } = {}
) => {
  if (!query || typeof query !== 'object') {
    return null;
  }

  const pagination =
    query.pagination && typeof query.pagination === 'object' ? { ...query.pagination } : undefined;

  let normalized = null;

  const consider = (value) => {
    if (value === undefined || value === null || normalized !== null) {
      return;
    }
    const parsed = coercePositiveInteger(value);
    if (parsed !== null) {
      normalized = parsed;
    }
  };

  if (pagination) {
    PAGINATION_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(pagination, key)) {
        consider(pagination[key]);
      }
    });
  }

  COMMENT_LIMIT_ALIASES.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      consider(query[key]);
    }
  });

  const safeMaximum = coercePositiveInteger(maximum) ?? MAX_COMMENT_LIMIT;
  const fallbackLimit =
    clampLimit(fallback, safeMaximum) ?? Math.min(Math.max(DEFAULT_COMMENT_LIMIT, 1), safeMaximum);
  const limitValue = clampLimit(normalized, safeMaximum) ?? fallbackLimit;

  setQueryAliases(query, limitValue);

  if (pagination) {
    const nextPagination = query.pagination;
    PAGINATION_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(pagination, key)) {
        nextPagination[key] = limitValue;
      }
    });
  }

  return limitValue;
};

const stringifyQuery = (query) =>
  qs.stringify(query, {
    encodeValuesOnly: true,
    arrayFormat: 'indices',
    skipNulls: true,
  });

export const syncQueryContext = (ctx) => {
  if (!ctx || typeof ctx !== 'object') {
    return;
  }

  if (!ctx.query || typeof ctx.query !== 'object') {
    ctx.query = {};
  }

  if (ctx.state && typeof ctx.state === 'object') {
    ctx.state.query = { ...(ctx.state.query || {}), ...ctx.query };
  }

  if (ctx.request && typeof ctx.request === 'object') {
    ctx.request.query = ctx.query;
  }

  const nextQuerystring = stringifyQuery(ctx.query);
  ctx.querystring = nextQuerystring;

  if (ctx.request && typeof ctx.request === 'object') {
    ctx.request.querystring = nextQuerystring;

    if (typeof ctx.request.url === 'string') {
      const baseUrl = ctx.request.url.split('?')[0];
      ctx.request.url = nextQuerystring ? `${baseUrl}?${nextQuerystring}` : baseUrl;
    }
  }

  if (typeof ctx.originalUrl === 'string') {
    const baseOriginal = ctx.originalUrl.split('?')[0];
    ctx.originalUrl = nextQuerystring ? `${baseOriginal}?${nextQuerystring}` : baseOriginal;
  }

  if (ctx.req && typeof ctx.req === 'object' && typeof ctx.request?.url === 'string') {
    ctx.req.url = ctx.request.url;
  }
};

export const shouldSanitizeCommentsRequest = (ctx) => {
  if (!ctx || typeof ctx !== 'object') {
    return false;
  }

  const path = typeof ctx.path === 'string' ? ctx.path : typeof ctx.url === 'string' ? ctx.url : '';
  if (!path) {
    return false;
  }

  let normalizedPath = path;
  if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
    try {
      normalizedPath = new URL(normalizedPath).pathname;
    } catch (error) {
      normalizedPath = path;
    }
  }

  return ['/comments', '/api/comments'].some((prefix) => normalizedPath.startsWith(prefix));
};

export const COMMENT_LIMIT_DEFAULT = DEFAULT_COMMENT_LIMIT;
export const COMMENT_LIMIT_MAXIMUM = MAX_COMMENT_LIMIT;

const applyLimitToPagination = (pagination, limitValue, maximum) => {
  if (!pagination || typeof pagination !== 'object') {
    return;
  }

  const candidate =
    pagination.pageSize ?? pagination.page_size ?? pagination.limit ?? pagination._limit ?? limitValue;

  const resolved = clampLimit(candidate, maximum) ?? limitValue;

  pagination.limit = resolved;
  pagination.pageSize = resolved;
  pagination.page_size = resolved;
  pagination._limit = resolved;
};

export const normalizePaginationMeta = (
  payload,
  limit,
  { fallback = DEFAULT_COMMENT_LIMIT, maximum = MAX_COMMENT_LIMIT } = {},
) => {
  const safeMaximum = coercePositiveInteger(maximum) ?? MAX_COMMENT_LIMIT;
  const fallbackLimit =
    clampLimit(limit, safeMaximum) ??
    clampLimit(fallback, safeMaximum) ??
    Math.min(Math.max(DEFAULT_COMMENT_LIMIT, 1), safeMaximum);

  const apply = (container) => {
    if (!container || typeof container !== 'object') {
      return;
    }
    applyLimitToPagination(container, fallbackLimit, safeMaximum);
  };

  if (payload && typeof payload === 'object') {
    if (payload.pagination && typeof payload.pagination === 'object') {
      apply(payload.pagination);
    }

    if (payload.meta && typeof payload.meta === 'object' && payload.meta.pagination) {
      apply(payload.meta.pagination);
    }
  }
};
