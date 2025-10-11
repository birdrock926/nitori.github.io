const RELATION_PREFIX = 'api::post.post:';
const POST_UID = 'api::post.post';
const COMMENTS_UID = 'plugin::comments.comment';
const NUMERIC_PATTERN = /^\d+$/;

const relationCache = new Map();

const FALLBACK_EMAIL_DOMAIN = 'comments.local';
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
const DEFAULT_COMMENT_LIMIT = 50;
const MAX_COMMENT_LIMIT = 200;
const LIMIT_ALIAS_KEYS = [
  'limit',
  '_limit',
  'pageSize',
  'page_size',
  'pagination[limit]',
  'pagination[pageSize]',
  'pagination[page_size]',
];
const PAGINATION_ALIAS_KEYS = ['limit', 'pageSize', 'page_size'];
const PLACEHOLDER_SMTP_HOST_PATTERN = /(^|\.)example\.(?:com|net|org|dev)$/i;

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

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

const sanitizeCommentsLimit = (
  query,
  { fallback = DEFAULT_COMMENT_LIMIT, maximum = MAX_COMMENT_LIMIT } = {},
) => {
  if (!query || typeof query !== 'object') {
    return { limit: Math.min(Math.max(fallback ?? DEFAULT_COMMENT_LIMIT, 1), maximum) };
  }

  const pagination =
    query.pagination && typeof query.pagination === 'object' ? { ...query.pagination } : undefined;

  let normalized = null;
  const consider = (value) => {
    if (value === undefined || value === null || normalized !== null) {
      return;
    }

    const parsed = coercePositiveInteger(value);
    if (parsed !== null) {
      normalized = parsed;
    }
  };

  if (pagination) {
    PAGINATION_ALIAS_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(pagination, key)) {
        consider(pagination[key]);
      }
    });
  }

  LIMIT_ALIAS_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      consider(query[key]);
    }
  });

  const safeFallback = Number.isFinite(fallback) ? fallback : DEFAULT_COMMENT_LIMIT;
  const limitValue = Math.min(Math.max(normalized ?? safeFallback, 1), maximum);
  const serializedLimit = String(limitValue);

  const nextPagination = { ...(pagination || {}) };
  nextPagination.limit = limitValue;
  nextPagination.pageSize = limitValue;

  PAGINATION_ALIAS_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(nextPagination, key)) {
      nextPagination[key] = limitValue;
    }
  });

  query.pagination = nextPagination;
  query.limit = limitValue;

  LIMIT_ALIAS_KEYS.forEach((key) => {
    if (key !== 'limit' && Object.prototype.hasOwnProperty.call(query, key)) {
      query[key] = serializedLimit;
    }
  });

  return { limit: limitValue, serialized: serializedLimit };
};

const serializeQuery = (query) => {
  if (!query || typeof query !== 'object') {
    return '';
  }

  const params = new URLSearchParams();
  const appendEntry = (prefix, value) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        appendEntry(prefix, item);
      });
      return;
    }

    if (typeof value === 'object') {
      Object.entries(value).forEach(([childKey, childValue]) => {
        appendEntry(`${prefix}[${childKey}]`, childValue);
      });
      return;
    }

    params.set(prefix, String(value));
  };

  Object.entries(query).forEach(([key, value]) => {
    appendEntry(key, value);
  });

  return params.toString();
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

const normalizeRelationValue = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }

  return null;
};

const coerceEntryId = (post) => {
  if (!post) {
    return null;
  }

  const candidates = [post.id, post.entryId, post.entry_id];

  for (const candidate of candidates) {
    const normalized = normalizeRelationValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const coerceDocumentId = (post) => {
  if (!post) {
    return null;
  }

  return normalizeRelationValue(post.documentId) ?? normalizeRelationValue(post.document_id);
};

const fetchPostByWhere = async (where) => {
  try {
    return await strapi.db.query(POST_UID).findOne({ where, select: ['id', 'documentId', 'document_id', 'slug'] });
  } catch (error) {
    strapi.log.error('[comments] Failed to resolve post for comments relation normalization.', error);
    return null;
  }
};

const resolveRelationId = async (identifier) => {
  if (!identifier) {
    return null;
  }

  const cacheKey = identifier;
  if (relationCache.has(cacheKey)) {
    return relationCache.get(cacheKey);
  }

  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) {
    return null;
  }

  let relationId = null;

  const cacheIdentifiersForPost = (post, entryIdentifier, documentIdentifier) => {
    const normalizedEntry = entryIdentifier ? String(entryIdentifier) : null;
    const normalizedDocument = documentIdentifier ? String(documentIdentifier) : null;

    if (normalizedEntry) {
      relationCache.set(normalizedEntry, normalizedEntry);
    }

    if (normalizedEntry && normalizedDocument) {
      relationCache.set(normalizedDocument, normalizedEntry);
    }

    if (typeof post?.slug === 'string') {
      const slug = post.slug.trim();
      if (slug && normalizedEntry) {
        relationCache.set(slug, normalizedEntry);
      }
    }
  };

  const resolveFromWhere = async (where) => {
    const post = await fetchPostByWhere(where);
    if (!post) {
      return null;
    }

    const entryIdentifier = coerceEntryId(post);
    const documentIdentifier = coerceDocumentId(post);

    cacheIdentifiersForPost(post, entryIdentifier, documentIdentifier);

    if (entryIdentifier) {
      return entryIdentifier;
    }

    if (documentIdentifier) {
      return documentIdentifier;
    }

    return null;
  };

  relationId = await resolveFromWhere({
    $or: [
      { documentId: trimmedIdentifier },
      { document_id: trimmedIdentifier },
    ],
  });

  if (!relationId && NUMERIC_PATTERN.test(trimmedIdentifier)) {
    const numericId = Number(trimmedIdentifier);
    if (Number.isFinite(numericId)) {
      relationId = await resolveFromWhere({ id: numericId });
    }

    if (!relationId) {
      relationId = await resolveFromWhere({ id: trimmedIdentifier });
    }
  }

  if (!relationId) {
    relationId = await resolveFromWhere({ slug: trimmedIdentifier });
  }

  if (!relationId) {
    relationCache.set(cacheKey, null);
    return null;
  }

  relationCache.set(cacheKey, relationId);
  return relationId;
};

const normalizeRelation = async (relation) => {
  if (typeof relation !== 'string' || !relation.startsWith(RELATION_PREFIX)) {
    return relation;
  }

  const identifier = relation.slice(RELATION_PREFIX.length).trim();
  if (!identifier) {
    return relation;
  }

  const relationId = await resolveRelationId(identifier);
  if (!relationId) {
    strapi.log.warn('[comments] failed to resolve relation identifier', { identifier });
    return relation;
  }

  return `${RELATION_PREFIX}${relationId}`;
};

const normalizeExistingCommentRelations = async () => {
  const pageSize = 200;
  let processed = 0;
  let updated = 0;
  let lastId = null;

  while (true) {
    const where =
      lastId === null
        ? { related: { $startsWith: RELATION_PREFIX } }
        : {
            $and: [
              { related: { $startsWith: RELATION_PREFIX } },
              { id: { $gt: lastId } },
            ],
          };

    const comments = await strapi.db.query(COMMENTS_UID).findMany({
      where,
      select: ['id', 'related'],
      orderBy: { id: 'asc' },
      limit: pageSize,
    });

    if (!comments || comments.length === 0) {
      break;
    }

    for (const comment of comments) {
      processed += 1;
      lastId = comment.id;

      const related = typeof comment.related === 'string' ? comment.related : '';
      if (!related.startsWith(RELATION_PREFIX)) {
        continue;
      }

      const identifier = related.slice(RELATION_PREFIX.length).trim();
      if (!identifier) {
        continue;
      }

      const resolved = await resolveRelationId(identifier);
      if (!resolved || resolved === identifier) {
        continue;
      }

      const nextRelation = `${RELATION_PREFIX}${resolved}`;
      if (nextRelation === related) {
        continue;
      }

      try {
        await strapi.db.query(COMMENTS_UID).update({
          where: { id: comment.id },
          data: { related: nextRelation },
        });
        updated += 1;
      } catch (error) {
        strapi.log.warn('[comments] failed to normalize stored comment relation', {
          commentId: comment.id,
          related,
          nextRelation,
          error,
        });
      }
    }

    if (comments.length < pageSize) {
      break;
    }
  }

  if (updated > 0) {
    strapi.log.info('[comments] normalized stored comment relations', {
      processed,
      updated,
    });
  }
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

const wrapCommentsController = (controller, { sanitizeLimit = false } = {}) => {
  if (typeof controller !== 'function') {
    return controller;
  }

  return async function enhancedCommentsController(ctx, next) {
    if (sanitizeLimit && ctx) {
      if (!ctx.query || typeof ctx.query !== 'object') {
        ctx.query = {};
      }

      const sanitized = sanitizeCommentsLimit(ctx.query);

      if (ctx.state) {
        if (!ctx.state.query || typeof ctx.state.query !== 'object') {
          ctx.state.query = {};
        }

        ctx.state.query = { ...ctx.state.query, ...ctx.query };

        if (ctx.query?.pagination && typeof ctx.query.pagination === 'object') {
          ctx.state.query.pagination = {
            ...(ctx.state.query.pagination || {}),
            ...ctx.query.pagination,
          };
        }
      }

      if (ctx.request) {
        if (!ctx.request.query || ctx.request.query === ctx.query) {
          ctx.request.query = ctx.query;
        } else {
          ctx.request.query = { ...ctx.request.query, ...ctx.query };
        }

        try {
          const serialized = serializeQuery(ctx.query);
          if (serialized || sanitized?.limit) {
            ctx.request.querystring = serialized;
          }
          ctx.querystring = serialized;
        } catch (error) {
          ctx.log?.debug?.('comments.limit.serializeQuery.failed', { error });
        }
      }
    }

    return controller.call(this, ctx, next);
  };
};

export default (plugin) => {
  if (plugin?.controllers?.admin?.findAll) {
    plugin.controllers.admin.findAll = wrapCommentsController(plugin.controllers.admin.findAll, {
      sanitizeLimit: true,
    });
  }

  if (plugin?.controllers?.client) {
    const sanitizeKeys = new Set(['findAll', 'findAllFlat', 'findAllInHierarchy', 'findAllPerAuthor']);

    Object.entries(plugin.controllers.client).forEach(([key, handler]) => {
      if (typeof handler !== 'function' || key === 'post') {
        return;
      }

      if (sanitizeKeys.has(key) || key.startsWith('find')) {
        plugin.controllers.client[key] = wrapCommentsController(handler, {
          sanitizeLimit: sanitizeKeys.has(key),
        });
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

      const smtpHost = normalizeString(process.env.SMTP_HOST).toLowerCase();
      if (
        !smtpHost ||
        PLACEHOLDER_SMTP_HOST_PATTERN.test(smtpHost) ||
        smtpHost === '127.0.0.1' ||
        smtpHost === 'localhost'
      ) {
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
        strapi.log.warn('[comments] failed to send response notification email', {
          error,
        });
        return null;
      }

      return null;
    };
  }

  const originalBootstrap = typeof plugin.bootstrap === 'function' ? plugin.bootstrap : null;

  plugin.bootstrap = async function commentsBootstrap(...args) {
    if (originalBootstrap) {
      await originalBootstrap.apply(this, args);
    }

    try {
      await normalizeExistingCommentRelations();
    } catch (error) {
      strapi.log.error('[comments] failed to normalize stored relations during bootstrap', {
        error,
      });
    }
  };

  return plugin;
};
