import { factories } from '@strapi/strapi';

const ensurePublishedFilter = (filters = {}) => {
  const base = filters && typeof filters === 'object' ? filters : {};
  const published = base.publishedAt && typeof base.publishedAt === 'object' ? base.publishedAt : {};

  return {
    ...base,
    publishedAt: {
      ...published,
      $notNull: true,
    },
  };
};

const DEFAULT_POPULATE = {
  cover: { populate: '*' },
  tags: { populate: '*' },
  blocks: { populate: '*' },
};

const resolvePopulate = (incoming) => {
  if (!incoming || incoming === 'deep' || incoming === '*') {
    return DEFAULT_POPULATE;
  }

  if (Array.isArray(incoming)) {
    return Array.from(new Set([...incoming, ...Object.keys(DEFAULT_POPULATE)]));
  }

  if (typeof incoming === 'object') {
    return {
      ...DEFAULT_POPULATE,
      ...incoming,
    };
  }

  return incoming;
};

export default factories.createCoreController('api::post.post', () => ({
  async find(ctx) {
    const sanitizedQuery = await this.sanitizeQuery(ctx);

    ctx.query = {
      ...sanitizedQuery,
      filters: ensurePublishedFilter(sanitizedQuery.filters || {}),
      populate: resolvePopulate(sanitizedQuery.populate),
    };

    return super.find(ctx);
  },

  async findOne(ctx) {
    const sanitizedQuery = await this.sanitizeQuery(ctx);

    ctx.query = {
      ...sanitizedQuery,
      filters: ensurePublishedFilter(sanitizedQuery.filters || {}),
      populate: resolvePopulate(sanitizedQuery.populate),
    };

    return super.findOne(ctx);
  },
}));
