import { COMMENT_STATUSES, COMMENT_STATUS_SET } from './constants.js';

export const sanitizeSlug = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-]+|[-]+$/g, '');

export const collectSlugCandidates = (slug) => {
  const raw = slug ? slug.toString().trim() : '';
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const sanitized = sanitizeSlug(raw);
  return Array.from(new Set([raw, lower, sanitized].filter(Boolean)));
};

const buildSlugWhere = (candidates = []) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const slugMatchers = candidates.flatMap((value) => [
    { slug: { $eq: value } },
    { slug: { $eqi: value } },
  ]);

  return {
    $and: [
      { $or: slugMatchers },
      { publishedAt: { $notNull: true } },
    ],
  };
};

export const findPublishedPostBySlug = async (strapi, slug) => {
  const candidates = collectSlugCandidates(slug);
  if (!candidates.length) {
    return null;
  }

  const where = buildSlugWhere(candidates);
  if (!where) {
    return null;
  }

  const entry = await strapi.db.query('api::post.post').findOne({
    where,
    select: ['id', 'slug', 'title', 'commentAliasDefault'],
  });

  return entry ?? null;
};

export const normalizeStatus = (value) => {
  if (typeof value !== 'string') {
    return COMMENT_STATUSES.PENDING;
  }
  const normalized = value.trim().toLowerCase();
  return COMMENT_STATUS_SET.has(normalized) ? normalized : COMMENT_STATUSES.PENDING;
};
