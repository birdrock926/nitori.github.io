const sanitizeSlug = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-]+|[-]+$/g, '');

const DEFAULT_COMMENT_AUTHOR = '名無しのユーザーさん';
const DEFAULT_BODY_FONT_SCALE = 'default';
const BODY_FONT_SCALE_VALUES = new Set(['default', 'large', 'xlarge']);

const normalizeId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return null;
};

const resolveEntityId = (event) => {
  const whereId = normalizeId(event?.params?.where?.id);
  if (whereId !== null && whereId !== undefined) {
    return whereId;
  }
  const dataId = normalizeId(event?.params?.data?.id);
  if (dataId !== null && dataId !== undefined) {
    return dataId;
  }
  return null;
};

const ensureUniqueSlug = async (event) => {
  const data = event?.params?.data;
  if (!data) return;

  const source = data.slug || data.title;
  if (!source) return;

  const base = sanitizeSlug(source);
  const fallback = base || `post-${Date.now()}`;
  let candidate = base || fallback;
  let attempt = 1;
  const entityId = resolveEntityId(event);

  const isTaken = async (slug) =>
    Boolean(
      await strapi.db.query('api::post.post').findOne({
        where: {
          slug,
          ...(entityId
            ? {
                id: {
                  $ne: entityId,
                },
              }
            : {}),
        },
      })
    );

  while (await isTaken(candidate)) {
    attempt += 1;
    candidate = `${fallback}-${attempt}`;
  }

  data.slug = candidate;
};

const COMMENT_DEFAULT_AUTHOR_KEYS = ['commentDefaultAuthor', 'comment_default_author'];

const applyDefaultCommentAuthor = (data, { requireExistingField = false } = {}) => {
  if (!data || typeof data !== 'object') {
    return;
  }

  const hasField = COMMENT_DEFAULT_AUTHOR_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(data, key)
  );

  if (!hasField) {
    if (requireExistingField) {
      return;
    }
    data.commentDefaultAuthor = DEFAULT_COMMENT_AUTHOR;
    return;
  }

  const valueKey = COMMENT_DEFAULT_AUTHOR_KEYS.find((key) =>
    Object.prototype.hasOwnProperty.call(data, key)
  );
  const value = valueKey ? data[valueKey] : data.commentDefaultAuthor;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    data.commentDefaultAuthor = trimmed.length > 0 ? trimmed : DEFAULT_COMMENT_AUTHOR;
  } else if (value === null || value === undefined) {
    data.commentDefaultAuthor = DEFAULT_COMMENT_AUTHOR;
  }

  COMMENT_DEFAULT_AUTHOR_KEYS.forEach((key) => {
    if (key !== 'commentDefaultAuthor' && Object.prototype.hasOwnProperty.call(data, key)) {
      delete data[key];
    }
  });
};

const BODY_FONT_SCALE_KEYS = ['bodyFontScale', 'body_font_scale'];

const applyBodyFontScale = (data, { requireExistingField = false } = {}) => {
  if (!data || typeof data !== 'object') {
    return;
  }

  const hasKey = BODY_FONT_SCALE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(data, key));

  if (!hasKey) {
    if (requireExistingField) {
      return;
    }
    data.bodyFontScale = DEFAULT_BODY_FONT_SCALE;
    return;
  }

  const key = BODY_FONT_SCALE_KEYS.find((candidate) => Object.prototype.hasOwnProperty.call(data, candidate));
  const value = key ? data[key] : data.bodyFontScale;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    data.bodyFontScale = BODY_FONT_SCALE_VALUES.has(normalized) ? normalized : DEFAULT_BODY_FONT_SCALE;
  } else if (value === null || value === undefined) {
    data.bodyFontScale = DEFAULT_BODY_FONT_SCALE;
  }

  BODY_FONT_SCALE_KEYS.forEach((candidate) => {
    if (candidate !== 'bodyFontScale' && Object.prototype.hasOwnProperty.call(data, candidate)) {
      delete data[candidate];
    }
  });
};

export default {
  async beforeCreate(event) {
    await ensureUniqueSlug(event);
    applyDefaultCommentAuthor(event?.params?.data);
    applyBodyFontScale(event?.params?.data);
  },
  async beforeUpdate(event) {
    await ensureUniqueSlug(event);
    applyDefaultCommentAuthor(event?.params?.data, { requireExistingField: true });
    applyBodyFontScale(event?.params?.data, { requireExistingField: true });
  },
};
