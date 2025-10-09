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

const DEFAULT_COMMENT_AUTHOR = '名無しのユーザーさん';
const DEFAULT_BODY_FONT_SCALE = 'default';
const BODY_FONT_SCALE_VALUES = new Set(['default', 'large', 'xlarge']);

const readCommentDefaultAuthor = (entity) => {
  if (!entity || typeof entity !== 'object') {
    return DEFAULT_COMMENT_AUTHOR;
  }

  const direct = entity.commentDefaultAuthor ?? entity.comment_default_author;
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }

  const attributes = entity.attributes && typeof entity.attributes === 'object' ? entity.attributes : undefined;

  if (attributes) {
    const attributeValue = attributes.commentDefaultAuthor ?? attributes.comment_default_author;
    if (typeof attributeValue === 'string' && attributeValue.trim().length > 0) {
      return attributeValue.trim();
    }
  }

  return DEFAULT_COMMENT_AUTHOR;
};

const readBodyFontScale = (entity) => {
  if (!entity || typeof entity !== 'object') {
    return DEFAULT_BODY_FONT_SCALE;
  }

  const direct = entity.bodyFontScale ?? entity.body_font_scale;
  if (typeof direct === 'string' && direct.trim().length > 0) {
    const normalized = direct.trim().toLowerCase();
    return BODY_FONT_SCALE_VALUES.has(normalized) ? normalized : DEFAULT_BODY_FONT_SCALE;
  }

  const attributes = entity.attributes && typeof entity.attributes === 'object' ? entity.attributes : undefined;

  if (attributes) {
    const attributeValue = attributes.bodyFontScale ?? attributes.body_font_scale;
    if (typeof attributeValue === 'string' && attributeValue.trim().length > 0) {
      const normalized = attributeValue.trim().toLowerCase();
      return BODY_FONT_SCALE_VALUES.has(normalized) ? normalized : DEFAULT_BODY_FONT_SCALE;
    }
  }

  return DEFAULT_BODY_FONT_SCALE;
};

const enrichPostEntity = (sanitized, raw) => {
  const withDocument = attachDocumentId(sanitized, raw);

  if (Array.isArray(withDocument)) {
    if (Array.isArray(raw)) {
      return withDocument.map((item, index) => enrichPostEntity(item, raw[index]));
    }
    return withDocument.map((item) => enrichPostEntity(item, raw));
  }

  if (!withDocument || typeof withDocument !== 'object') {
    return withDocument;
  }

  const commentDefaultAuthor = readCommentDefaultAuthor(raw);
  const bodyFontScale = readBodyFontScale(raw);

  return {
    ...withDocument,
    commentDefaultAuthor,
    bodyFontScale,
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

const MEDIA_POPULATE = { populate: '*' };

const BLOCK_COMPONENT_POPULATE = {
  'content.rich-text': true,
  'content.colored-text': true,
  'media.figure': MEDIA_POPULATE,
  'media.gallery': { populate: '*' },
  'embed.twitch-live': true,
  'embed.twitch-vod': true,
  'embed.youtube': true,
  'layout.callout': { populate: '*' },
  'layout.columns': { populate: '*' },
  'layout.separator': true,
  'ads.inline-slot': true,
};

const ensureBlocksPopulate = (value) => {
  const base = {
    populate: {
      on: {
        ...BLOCK_COMPONENT_POPULATE,
      },
    },
  };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return base;
  }

  const next = { ...base };

  if (value.count !== undefined) {
    next.count = value.count;
  }

  if (value.fields) {
    next.fields = value.fields;
  }

  if (value.filters) {
    next.filters = value.filters;
  }

  if (value.sort) {
    next.sort = value.sort;
  }

  const populateSection = (() => {
    if (value.populate && typeof value.populate === 'object' && !Array.isArray(value.populate)) {
      return value.populate;
    }

    if (value.on && typeof value.on === 'object' && !Array.isArray(value.on)) {
      return { on: value.on };
    }

    return {};
  })();

  const overrides =
    populateSection.on && typeof populateSection.on === 'object' && !Array.isArray(populateSection.on)
      ? populateSection.on
      : {};

  next.populate.on = {
    ...BLOCK_COMPONENT_POPULATE,
    ...overrides,
  };

  return next;
};

const buildDefaultPopulate = () => ({
  cover: MEDIA_POPULATE,
  tags: { populate: '*' },
  blocks: ensureBlocksPopulate(),
});

const normalizePopulate = (populate) => {
  const base = buildDefaultPopulate();

  if (!populate || populate === '*' || populate === 'deep') {
    return base;
  }

  if (Array.isArray(populate)) {
    return populate.reduce((acc, key) => {
      if (typeof key === 'string' && key) {
        if (key === 'blocks') {
          acc.blocks = ensureBlocksPopulate();
        } else {
          acc[key] = base[key] ?? true;
        }
      }
      return acc;
    }, { ...base });
  }

  if (typeof populate !== 'object') {
    return base;
  }

  const next = { ...base, ...populate };
  next.blocks = ensureBlocksPopulate(populate.blocks ?? populate);
  return next;
};

const mergePopulate = (incoming) => normalizePopulate(incoming);

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
    const populate = mergePopulate(ctx.query.populate);
    ctx.query.populate = populate;
    ctx.query = applyDefaultSort(ctx.query);

    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);
    const finalQuery = {
      ...sanitizedQuery,
      populate,
    };

    const { results, pagination } = await strapi.service('api::post.post').find(finalQuery);
    const sanitizedResults = await this.sanitizeOutput(results, ctx);
    const enrichedResults = enrichPostEntity(sanitizedResults, results);
    return this.transformResponse(enrichedResults, { pagination });
  },

  async findOne(ctx) {
    ctx.query = ctx.query || {};
    ctx.query.filters = ensurePublishedFilter(ctx.query.filters);
    const populate = mergePopulate(ctx.query.populate);
    ctx.query.populate = populate;
    ctx.query = applyDefaultSort(ctx.query);

    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);
    const finalQuery = {
      ...sanitizedQuery,
      populate,
    };

    const entity = await strapi.service('api::post.post').findOne(ctx.params.id, finalQuery);
    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    const enrichedEntity = enrichPostEntity(sanitizedEntity, entity);
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
      populate: buildDefaultPopulate(),
      limit: 1,
    };

    const results = await strapi.entityService.findMany('api::post.post', query);
    const entity = Array.isArray(results) ? results[0] : results;

    if (!entity) {
      return ctx.notFound('記事が見つかりません');
    }

    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    const enrichedEntity = enrichPostEntity(sanitizedEntity, entity);
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
