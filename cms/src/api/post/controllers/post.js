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

const mergePopulate = (incoming) => {
  if (!incoming || incoming === 'deep' || incoming === '*') {
    return DEFAULT_POPULATE;
  }

  if (Array.isArray(incoming)) {
    const base = Array.from(new Set(incoming));
    DEFAULT_POPULATE.cover && base.push('cover');
    DEFAULT_POPULATE.tags && base.push('tags');
    DEFAULT_POPULATE.blocks && base.push('blocks');
    return Array.from(new Set(base));
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
    const query = {
      ...sanitizedQuery,
      filters: ensurePublishedFilter(sanitizedQuery.filters || {}),
      populate: mergePopulate(sanitizedQuery.populate),
    };

    const { results, pagination } = await strapi.service('api::post.post').find(query);
    const sanitizedResults = await this.sanitizeOutput(results, ctx);
    return this.transformResponse(sanitizedResults, { pagination });
  },

  async findOne(ctx) {
    const sanitizedQuery = await this.sanitizeQuery(ctx);
    const query = {
      ...sanitizedQuery,
      filters: ensurePublishedFilter(sanitizedQuery.filters || {}),
      populate: mergePopulate(sanitizedQuery.populate),
    };

    const entity = await strapi.service('api::post.post').findOne(ctx.params.id, query);
    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));
