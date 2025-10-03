import slugify from 'slugify';

const sanitizeSlug = (value = '') =>
  slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  });

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

export default {
  async beforeCreate(event) {
    await ensureUniqueSlug(event);
  },
  async beforeUpdate(event) {
    await ensureUniqueSlug(event);
  },
};
