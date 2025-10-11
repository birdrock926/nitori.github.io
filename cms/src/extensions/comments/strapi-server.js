const RELATION_PREFIX = 'api::post.post:';
const POST_UID = 'api::post.post';
const COMMENTS_UID = 'plugin::comments.comment';
const NUMERIC_PATTERN = /^\d+$/;
const RELATION_BOOTSTRAP_FLAG = Symbol.for('birdrock.comments.normalizeRelations');
const DOCUMENT_MIDDLEWARE_FLAG = Symbol.for('birdrock.comments.documentsMiddleware');

const relationCache = new Map();
const FALLBACK_EMAIL_DOMAIN = 'comments.local';
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
const DEFAULT_COMMENT_LIMIT = 50;
const MAX_COMMENT_LIMIT = 200;
const RELATION_BATCH_SIZE = 100;

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

const sanitizeCommentsLimit = (query, { fallback = DEFAULT_COMMENT_LIMIT, maximum = MAX_COMMENT_LIMIT } = {}) => {
  if (!query || typeof query !== 'object') {
    return null;
  }

  const pagination =
    query.pagination && typeof query.pagination === 'object' ? { ...query.pagination } : undefined;

  const aliasKeys = [
    'limit',
    '_limit',
    'pageSize',
    'page_size',
    'pagination[limit]',
    'pagination[pageSize]',
    'pagination[page_size]',
  ];

  const paginationAliasKeys = ['limit', 'pageSize', 'page_size'];

  let normalized = null;
  let sawCandidate = false;

  const consider = (value) => {
    if (value === undefined || value === null) {
      return;
    }
    sawCandidate = true;
    if (normalized !== null) {
      return;
    }
    const parsed = coercePositiveInteger(value);
    if (parsed !== null) {
      normalized = parsed;
    }
  };

  if (pagination) {
    paginationAliasKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(pagination, key)) {
        consider(pagination[key]);
      }
    });
  }

  aliasKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      consider(query[key]);
    }
  });

  const limitValue =
    normalized !== null
      ? Math.min(Math.max(normalized, 1), maximum)
      : sawCandidate
      ? Math.min(Math.max(fallback, 1), maximum)
      : null;

  aliasKeys.forEach((key) => {
    if (key !== 'limit' && Object.prototype.hasOwnProperty.call(query, key)) {
      delete query[key];
    }
  });

  if (pagination) {
    paginationAliasKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(pagination, key)) {
        delete pagination[key];
      }
    });
  }

  if (limitValue !== null) {
    query.limit = limitValue;
    const nextPagination = { ...(pagination || {}) };
    nextPagination.limit = limitValue;
    nextPagination.pageSize = limitValue;
    query.pagination = nextPagination;
    return limitValue;
  }

  if (pagination) {
    if (Object.keys(pagination).length > 0) {
      query.pagination = pagination;
    } else if (Object.prototype.hasOwnProperty.call(query, 'pagination')) {
      delete query.pagination;
    }
  }

  if (Object.prototype.hasOwnProperty.call(query, 'limit')) {
    delete query.limit;
  }

  return null;
};

const buildQueryString = (ctx, limitValue) => {
  if (!ctx || !ctx.request) {
    return;
  }

  const limitKeys = [
    'limit',
    '_limit',
    'pageSize',
    'page_size',
    'pagination[limit]',
    'pagination[pageSize]',
    'pagination[page_size]',
  ];

  const params = new URLSearchParams(typeof ctx.request.querystring === 'string' ? ctx.request.querystring : '');
  limitKeys.forEach((key) => {
    if (params.has(key)) {
      params.delete(key);
    }
  });

  if (limitValue !== null && limitValue !== undefined) {
    const limitString = String(limitValue);
    params.set('limit', limitString);
    params.set('pagination[limit]', limitString);
    params.set('pagination[pageSize]', limitString);
  }

  const nextQueryString = params.toString();
  ctx.request.querystring = nextQueryString;
  ctx.querystring = nextQueryString;
};

const withSanitizedLimit = (controller) => {
  if (typeof controller !== 'function') {
    return controller;
  }

  return async function controllerWithSanitizedLimit(ctx, next) {
    if (ctx) {
      if (!ctx.query || typeof ctx.query !== 'object') {
        ctx.query = {};
      }

      const limitValue = sanitizeCommentsLimit(ctx.query);

      if (ctx.request) {
        ctx.request.query = { ...(ctx.request.query || {}), ...ctx.query };
        buildQueryString(ctx, limitValue);
      }

      if (!ctx.state || typeof ctx.state !== 'object') {
        ctx.state = {};
      }

      ctx.state.query = { ...(ctx.state.query || {}), ...ctx.query };
    }

    return controller.call(this, ctx, next);
  };
};

const coerceString = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return null;
};

const isLikelyEmail = (value) => /.+@.+\..+/.test(value);
const isFallbackEmail = (value) =>
  typeof value === 'string' && value.trim().toLowerCase().endsWith(`@${FALLBACK_EMAIL_DOMAIN}`);

const buildFallbackEmail = (author, content) => {
  const source =
    coerceString(author?.id) || coerceString(author?.name) || coerceString(content) || 'anonymous';

  const encoded = Buffer.from(source, 'utf8')
    .toString('base64url')
    .replace(/[^a-zA-Z0-9._-]+/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^-+|-+$/g, '');

  const localPart = (encoded || 'anonymous').slice(0, MAX_EMAIL_LOCAL_PART_LENGTH);
  return `${localPart}@${FALLBACK_EMAIL_DOMAIN}`;
};

const ensureAuthorEmail = (ctx) => {
  const body = ctx?.request?.body;
  if (!body || typeof body !== 'object') {
    return;
  }

  const { author } = body;
  if (!author || typeof author !== 'object') {
    return;
  }

  if (typeof author.email === 'string') {
    const trimmed = author.email.trim();
    if (trimmed && isLikelyEmail(trimmed)) {
      author.email = trimmed;
      return;
    }
  }

  author.email = buildFallbackEmail(author, body.content);
};

const coerceDocumentId = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
};

const fetchPostByWhere = async (where, strapiInstance = strapi) => {
  try {
    return await strapiInstance.db
      .query(POST_UID)
      .findOne({ where, select: ['id', 'documentId', 'document_id', 'slug', 'locale'] });
  } catch (error) {
    strapiInstance.log.error('[comments] Failed to resolve post for comments relation normalization.', error);
    return null;
  }
};

const cacheRelationIdentifier = (key, value) => {
  if (!key) {
    return;
  }

  relationCache.set(key, value ?? null);

  if (value) {
    relationCache.set(value, value);
  }
};

const resolveRelationDocumentId = async (identifier, strapiInstance = strapi) => {
  if (!identifier) {
    return null;
  }

  if (relationCache.has(identifier)) {
    return relationCache.get(identifier);
  }

  let documentId = null;

  if (NUMERIC_PATTERN.test(identifier)) {
    const numeric = Number.parseInt(identifier, 10);
    if (Number.isFinite(numeric) && numeric > 0) {
      const postById = await fetchPostByWhere({ id: numeric }, strapiInstance);
      documentId = coerceDocumentId(postById?.documentId ?? postById?.document_id);
    }
  }

  if (!documentId) {
    const byDocumentId = await fetchPostByWhere(
      {
        $or: [
          { documentId: identifier },
          { document_id: identifier },
        ],
      },
      strapiInstance,
    );

    documentId = coerceDocumentId(byDocumentId?.documentId ?? byDocumentId?.document_id);
  }

  if (!documentId) {
    const bySlug = await fetchPostByWhere({ slug: identifier }, strapiInstance);
    documentId = coerceDocumentId(bySlug?.documentId ?? bySlug?.document_id);
  }

  cacheRelationIdentifier(identifier, documentId);
  return documentId;
};

const normalizeRelation = async (relation) => {
  if (typeof relation !== 'string' || !relation.startsWith(RELATION_PREFIX)) {
    return relation;
  }

  const identifier = relation.slice(RELATION_PREFIX.length).trim();
  if (!identifier) {
    return relation;
  }

  const relationDocumentId = await resolveRelationDocumentId(identifier);
  if (!relationDocumentId) {
    return relation;
  }

  return `${RELATION_PREFIX}${relationDocumentId}`;
};

const mapReportReason = (value) => {
  if (value === undefined || value === null) {
    return 'OTHER';
  }

  const raw = String(value).trim();
  if (!raw) {
    return 'OTHER';
  }

  const upper = raw.toUpperCase();
  const normalized = raw.replace(/\s+/g, '').toLowerCase();

  const isBadLanguage =
    ['BAD_LANGUAGE', 'ABUSE', 'HARASSMENT', 'INSULT', 'OFFENSIVE', 'THREATS'].includes(upper) ||
    /中傷|ハラスメント|暴言|誹謗|侮辱/.test(raw);

  if (isBadLanguage) {
    return 'BAD_LANGUAGE';
  }

  const isDiscrimination =
    ['DISCRIMINATION', 'HATE', 'RACISM', 'SEXISM', 'HOMOPHOBIA', 'TRANSPHOBIA'].includes(upper) ||
    /差別|ヘイト|偏見|排除/.test(raw);

  if (isDiscrimination) {
    return 'DISCRIMINATION';
  }

  const isOther =
    ['OTHER', 'SPAM', 'ILLEGAL', 'DANGEROUS', 'ADVERTISEMENT', 'PROMOTION'].includes(upper) ||
    /スパム|宣伝|広告|違法|危険/.test(raw) ||
    normalized === 'other';

  if (isOther) {
    return 'OTHER';
  }

  return 'OTHER';
};

const annotateContent = (content, original) => {
  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  const annotation = original ? `選択された通報理由 (原文): ${original}` : '';

  if (!annotation) {
    return trimmedContent || undefined;
  }

  if (trimmedContent.includes(annotation)) {
    return trimmedContent;
  }

  return trimmedContent ? `${trimmedContent}\n\n${annotation}` : annotation;
};

const normalizeStoredCommentRelations = async (strapiInstance) => {
  const engine = strapiInstance?.db?.query ? strapiInstance.db : null;
  if (!engine) {
    return;
  }

  if (globalThis[RELATION_BOOTSTRAP_FLAG]) {
    return;
  }

  globalThis[RELATION_BOOTSTRAP_FLAG] = true;

  let lastId = 0;
  let updated = 0;
  let inspected = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const comments = await engine.query(COMMENTS_UID).findMany({
      where: {
        id: { $gt: lastId },
        related: { $startsWith: RELATION_PREFIX },
      },
      orderBy: { id: 'asc' },
      limit: RELATION_BATCH_SIZE,
      select: ['id', 'related'],
    });

    if (!comments || comments.length === 0) {
      break;
    }

    for (const comment of comments) {
      lastId = comment.id;

      if (typeof comment.related !== 'string' || !comment.related.startsWith(RELATION_PREFIX)) {
        continue;
      }

      inspected += 1;

      const identifier = comment.related.slice(RELATION_PREFIX.length).trim();
      if (!identifier) {
        continue;
      }

      const normalized = await resolveRelationDocumentId(identifier, strapiInstance);
      if (!normalized) {
        continue;
      }

      try {
        await engine.query(COMMENTS_UID).update({
          where: { id: comment.id },
          data: { related: `${RELATION_PREFIX}${normalized}` },
        });
        cacheRelationIdentifier(identifier, normalized);
        updated += 1;
      } catch (error) {
        strapiInstance.log.error('[comments] Failed to normalize stored relation.', error);
      }
    }

    if (comments.length < RELATION_BATCH_SIZE) {
      break;
    }
  }

  if (updated > 0) {
    strapiInstance.log.info(
      `[comments] Normalized ${updated} stored comment relations to document IDs (inspected ${inspected}).`,
    );
  }
};

const registerDocumentsMiddleware = (strapiInstance = strapi) => {
  const documents = strapiInstance?.documents;
  if (!documents || typeof documents.use !== 'function') {
    return;
  }

  if (globalThis[DOCUMENT_MIDDLEWARE_FLAG]) {
    return;
  }

  globalThis[DOCUMENT_MIDDLEWARE_FLAG] = true;

  documents.use(async (context, next) => {
    try {
      if (context?.uid === POST_UID && context?.params) {
        const { params } = context;

        const extractCandidate = () => {
          if (typeof params.documentId === 'string' && params.documentId) {
            return params.documentId;
          }

          if (params.documentId && typeof params.documentId !== 'string') {
            return String(params.documentId);
          }

          if (params.where && typeof params.where === 'object') {
            const whereDocument = params.where.documentId ?? params.where.document_id;
            if (typeof whereDocument === 'string' && whereDocument) {
              return whereDocument;
            }
            if (whereDocument && typeof whereDocument !== 'string') {
              return String(whereDocument);
            }
          }

          return null;
        };

        const candidate = extractCandidate();

        if (candidate && NUMERIC_PATTERN.test(candidate)) {
          const resolved = await resolveRelationDocumentId(candidate, strapiInstance);
          if (resolved && resolved !== candidate) {
            params.documentId = resolved;
            if (params.where && typeof params.where === 'object') {
              const nextWhere = { ...params.where, documentId: resolved };
              delete nextWhere.document_id;
              params.where = nextWhere;
            }
          }
        }
      }
    } catch (error) {
      strapiInstance.log.error('[comments] Failed to coerce documentId via documents middleware.', error);
    }

    return next();
  });
};

export default (plugin) => {
  if (plugin?.controllers?.admin?.findAll) {
    plugin.controllers.admin.findAll = withSanitizedLimit(plugin.controllers.admin.findAll);
  }

  if (plugin?.controllers?.client) {
    ['findAll', 'findAllFlat', 'findAllInHierarchy', 'findAllPerAuthor'].forEach((key) => {
      if (typeof plugin.controllers.client[key] === 'function') {
        plugin.controllers.client[key] = withSanitizedLimit(plugin.controllers.client[key]);
      }
    });
  }

  if (plugin?.controllers?.client?.post) {
    const basePost = plugin.controllers.client.post;

    plugin.controllers.client.post = async function postWithNormalizedRelation(ctx, next) {
      if (ctx?.params?.relation) {
        ctx.params.relation = await normalizeRelation(ctx.params.relation);
      }

      ensureAuthorEmail(ctx);

      return basePost(ctx, next);
    };
  }

  if (plugin?.services?.client?.reportAbuse) {
    const baseReportAbuse = plugin.services.client.reportAbuse;

    plugin.services.client.reportAbuse = async function reportAbuseWithNormalization(params = {}, user) {
      const normalizedParams = { ...params };

      if (normalizedParams.reason !== undefined) {
        const originalReason = normalizedParams.reason;
        const mapped = mapReportReason(originalReason);
        normalizedParams.reason = mapped;

        const canonicalOriginal =
          typeof originalReason === 'string' ? originalReason.trim().toUpperCase() : undefined;

        if (typeof originalReason === 'string' && canonicalOriginal !== mapped) {
          normalizedParams.content = annotateContent(normalizedParams.content, originalReason.trim());
        }
      }

      if (typeof normalizedParams.relation === 'string') {
        normalizedParams.relation = await normalizeRelation(normalizedParams.relation);
      }

      return baseReportAbuse.call(this, normalizedParams, user);
    };
  }

  if (plugin?.services?.client?.sendResponseNotification) {
    const baseService = plugin.services.client;

    baseService.sendResponseNotification = async function sendResponseNotificationWithoutFallback(entity) {
      if (!entity?.threadOf) {
        return null;
      }

      const commonService = this?.getCommonService?.();
      const thread =
        typeof entity.threadOf === 'object'
          ? entity.threadOf
          : await commonService?.findOne({
              id: entity.threadOf,
              related: entity.related,
              locale: entity.locale || null,
            });

      if (!thread) {
        return null;
      }

      const normalizeRecipient = (value) => {
        if (typeof value !== 'string') {
          return null;
        }
        const trimmed = value.trim();
        if (!trimmed || isFallbackEmail(trimmed)) {
          return null;
        }
        return trimmed;
      };

      let emailRecipient = normalizeRecipient(thread?.author?.email);

      if (!emailRecipient && thread?.authorUser) {
        const authorUser =
          typeof thread.authorUser === 'object'
            ? thread.authorUser
            : await strapi
                .query('plugin::users-permissions.user')
                .findOne({ where: { id: thread.authorUser } });
        emailRecipient = normalizeRecipient(authorUser?.email);
      }

      if (!emailRecipient) {
        return null;
      }

      const superAdmin = await strapi
        .query('admin::user')
        .findOne({ where: { roles: { code: 'strapi-super-admin' } } });

      const emailSender = await commonService?.getConfig('client.contactEmail', superAdmin?.email);
      const clientAppUrl = await commonService?.getConfig('client.url', 'our site');

      if (!emailSender) {
        return null;
      }

      try {
        await strapi
          .plugin('email')
          .service('email')
          .send({
            to: [emailRecipient],
            from: emailSender,
            subject: "You've got a new response to your comment",
            text: `Hello ${thread?.author?.name || emailRecipient}!
You've got a new response to your comment by ${entity?.author?.name || entity?.author?.email}.

------

"${entity.content}"

------

Visit ${clientAppUrl} and continue the discussion.
`,
          });
      } catch (error) {
        strapi.log.error(error);
        throw error;
      }

      return null;
    };
  }

  const baseBootstrap = plugin.bootstrap;

  plugin.bootstrap = async (...args) => {
    if (typeof baseBootstrap === 'function') {
      await baseBootstrap(...args);
    }

    const [{ strapi: bootstrapStrapi } = {}] = args;
    const activeStrapi = bootstrapStrapi || strapi;
    await normalizeStoredCommentRelations(activeStrapi);
    registerDocumentsMiddleware(activeStrapi);
  };

  return plugin;
};
