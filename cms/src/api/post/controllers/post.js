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
  tags: true,
  blocks: { populate: '*' },
};

const resolvePopulate = (incoming) => {
  if (!incoming || incoming === 'deep' || incoming === '*') {
    return DEFAULT_POPULATE;
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
