import { factories } from '@strapi/strapi';

const readDocumentId = (entity) => {
  if (!entity || typeof entity !== 'object') {
    return undefined;
  }

  if (typeof entity.documentId === 'string' && entity.documentId.trim().length > 0) {
    return entity.documentId;
  }

  if (typeof entity.document_id === 'string' && entity.document_id.trim().length > 0) {
    return entity.document_id;
  }

  const attributes = entity.attributes && typeof entity.attributes === 'object' ? entity.attributes : undefined;
  if (attributes && typeof attributes.documentId === 'string' && attributes.documentId.trim().length > 0) {
    return attributes.documentId;
  }

  return undefined;
};

const attachDocumentId = (sanitized, raw) => {
  if (!sanitized) {
    return sanitized;
  }

  if (Array.isArray(sanitized) && Array.isArray(raw)) {
    return sanitized.map((item, index) => attachDocumentId(item, raw[index]));
  }

  if (Array.isArray(sanitized)) {
    return sanitized;
  }

  const documentId = readDocumentId(raw);

  if (!documentId || typeof sanitized !== 'object') {
    return sanitized;
  }

  if ('documentId' in sanitized && sanitized.documentId) {
    return sanitized;
  }

  return {
    ...sanitized,
    documentId,
  };
};

const ensurePublishedFilter = (filters = {}) => {
  const base = filters && typeof filters === 'object' && !Array.isArray(filters) ? filters : {};
  const publishedCondition = {
    publishedAt: {
      $notNull: true,
    },
  };

  if (!Object.keys(base).length) {
    return publishedCondition;
  }

  if (base.$and && Array.isArray(base.$and)) {
    return {
      ...base,
      $and: [...base.$and, publishedCondition],
    };
  }

  if (base.publishedAt && typeof base.publishedAt === 'object') {
    return {
      ...base,
      publishedAt: {
        ...publishedCondition.publishedAt,
        ...base.publishedAt,
      },
    };
  }

  const hasQueryOperators = Object.keys(base).some((key) => key.startsWith('$'));
  if (hasQueryOperators) {
    return {
      $and: [base, publishedCondition],
    };
  }

  return {
    ...base,
    ...publishedCondition,
  };
};

const sanitizeSlugValue = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-]+|[-]+$/g, '');

const collectSlugCandidates = (slug) => {
  const raw = slug ? slug.toString().trim() : '';
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const sanitized = sanitizeSlugValue(raw);
  return Array.from(new Set([raw, lower, sanitized].filter(Boolean)));
};

const buildSlugFilter = (candidates = []) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const slugMatchers = candidates.flatMap((value) => [
    { slug: { $eq: value } },
    { slug: { $eqi: value } },
  ]);

  return { $or: slugMatchers };
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

const applyDefaultSort = (query = {}) => {
  if (!query.sort) {
    return { ...query, sort: 'publishedAt:desc' };
  }
  return query;
};

export default factories.createCoreController('api::post.post', () => ({
  async find(ctx) {
    ctx.query = ctx.query || {};
    ctx.query.filters = ensurePublishedFilter(ctx.query.filters);
    ctx.query.populate = mergePopulate(ctx.query.populate);
    ctx.query = applyDefaultSort(ctx.query);

    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);

    const { results, pagination } = await strapi.service('api::post.post').find(sanitizedQuery);
    const sanitizedResults = await this.sanitizeOutput(results, ctx);
    const enrichedResults = attachDocumentId(sanitizedResults, results);
    return this.transformResponse(enrichedResults, { pagination });
  },

  async findOne(ctx) {
    ctx.query = ctx.query || {};
    ctx.query.filters = ensurePublishedFilter(ctx.query.filters);
    ctx.query.populate = mergePopulate(ctx.query.populate);
    ctx.query = applyDefaultSort(ctx.query);

    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);

    const entity = await strapi.service('api::post.post').findOne(ctx.params.id, sanitizedQuery);
    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    const enrichedEntity = attachDocumentId(sanitizedEntity, entity);
    return this.transformResponse(enrichedEntity);
  },

  async findBySlug(ctx) {
    const slug = ctx.params?.slug;
    const candidates = collectSlugCandidates(slug);

    if (!candidates.length) {
      return ctx.notFound('記事が見つかりません');
    }

    const slugFilter = buildSlugFilter(candidates);

    if (!slugFilter) {
      return ctx.notFound('記事が見つかりません');
    }

    const query = {
      filters: ensurePublishedFilter(slugFilter),
      populate: DEFAULT_POPULATE,
      limit: 1,
    };

    const results = await strapi.entityService.findMany('api::post.post', query);
    const entity = Array.isArray(results) ? results[0] : results;

    if (!entity) {
      return ctx.notFound('記事が見つかりません');
    }

    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    const enrichedEntity = attachDocumentId(sanitizedEntity, entity);
    return this.transformResponse(enrichedEntity);
  },

  async slugs(ctx) {
    const query = {
      fields: ['slug'],
      filters: ensurePublishedFilter(),
      sort: [{ publishedAt: 'desc' }],
      limit: 500,
    };

    const entities = await strapi.entityService.findMany('api::post.post', query);
    const collection = Array.isArray(entities) ? entities : [entities].filter(Boolean);
    const slugs = collection
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry.slug === 'string') return entry.slug;
        if (entry.attributes && typeof entry.attributes.slug === 'string') {
          return entry.attributes.slug;
        }
        return null;
      })
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());

    return {
      data: slugs.map((slug) => ({ slug })),
    };
  },
}));
