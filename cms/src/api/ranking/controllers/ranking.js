import dayjs from 'dayjs';

const parseWindowHours = (input) => {
  const value = Number.parseInt(String(input ?? ''), 10);
  if (Number.isNaN(value) || value <= 0) {
    return 24;
  }
  return Math.min(Math.max(value, 1), 24 * 30);
};

const parseLimit = (input) => {
  const value = Number.parseInt(String(input ?? ''), 10);
  if (Number.isNaN(value) || value <= 0) {
    return 10;
  }
  return Math.min(Math.max(value, 1), 50);
};

const normalisePost = (entry, index = 0) => {
  if (!entry) {
    return null;
  }
  const base = entry.attributes ?? entry;
  const id = entry.id ?? base.id ?? index + 1;
  const title = base.title || base.attributes?.title || 'タイトル未設定';
  const slug = base.slug || base.attributes?.slug;

  if (!slug) {
    return null;
  }

  return {
    id,
    title,
    slug,
    score: Math.max(1, 100 - index * 4),
  };
};

const fetchPublishedPosts = async ({ hours, limit }) => {
  const since = dayjs().subtract(hours, 'hour').toISOString();
  const filters = {
    publishedAt: {
      $notNull: true,
      $gte: since,
    },
  };

  const results = await strapi.entityService.findMany('api::post.post', {
    filters,
    sort: [{ publishedAt: 'desc' }],
    limit,
    fields: ['id', 'title', 'slug', 'publishedAt'],
  });

  return Array.isArray(results) ? results : [results].filter(Boolean);
};

const fetchFallbackPosts = async (limit) => {
  const results = await strapi.entityService.findMany('api::post.post', {
    filters: { publishedAt: { $notNull: true } },
    sort: [{ publishedAt: 'desc' }],
    limit,
    fields: ['id', 'title', 'slug', 'publishedAt'],
  });

  return Array.isArray(results) ? results : [results].filter(Boolean);
};

export default {
  async index(ctx) {
    const hours = parseWindowHours(ctx.query?.hours);
    const limit = parseLimit(ctx.query?.limit);

    let posts = await fetchPublishedPosts({ hours, limit });

    if (!posts.length) {
      posts = await fetchFallbackPosts(limit);
    }

    const ranked = posts
      .map((entry, index) => {
        const scoreBoost = Math.max(0, limit - index);
        const base = normalisePost(entry, index);
        if (!base) {
          return null;
        }
        return {
          ...base,
          score: base.score + scoreBoost,
        };
      })
      .filter(Boolean);

    ctx.body = {
      data: ranked,
      meta: {
        hours,
        count: ranked.length,
      },
    };
  },
};
