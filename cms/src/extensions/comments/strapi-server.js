const RELATION_PREFIX = 'api::post.post:';
const POST_UID = 'api::post.post';
const NUMERIC_PATTERN = /^\d+$/;

const relationCache = new Map();
const FALLBACK_EMAIL_DOMAIN = 'comments.local';
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
const DEFAULT_COMMENT_LIMIT = 50;
const MAX_COMMENT_LIMIT = 200;
const FALLBACK_AUTHOR_NAME = '名無しのユーザーさん';

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

const withSanitizedLimit = (controller) => {
  if (typeof controller !== 'function') {
    return controller;
  }

  return async function controllerWithSanitizedLimit(ctx, next) {
    if (ctx) {
      if (!ctx.query || typeof ctx.query !== 'object') {
        ctx.query = {};
      }

      sanitizeCommentsLimit(ctx.query);

      if (ctx.request && ctx.request.query && ctx.request.query !== ctx.query) {
        ctx.request.query = { ...ctx.request.query, ...ctx.query };
      }
    }

    return controller.call(this, ctx, next);
  };
};

const coerceNameString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
};

const fallbackFirstName = (entity) => {
  const authorName = coerceNameString(entity?.author?.name);
  if (authorName) {
    return authorName;
  }
  const username = coerceNameString(entity?.authorUser?.username);
  if (username) {
    return username;
  }
  const email = coerceString(entity?.author?.email) || coerceString(entity?.authorUser?.email);
  if (email && email.includes('@')) {
    return email.split('@')[0] || email;
  }
  return FALLBACK_AUTHOR_NAME;
};

const normalizeAuthorUser = (entity) => {
  if (!entity || typeof entity !== 'object') {
    return;
  }

  if (!entity.authorUser || typeof entity.authorUser !== 'object') {
    return;
  }

  const current = entity.authorUser;
  const next = { ...current };

  const first = coerceNameString(current.firstname);
  const last = coerceNameString(current.lastname);
  const username = coerceNameString(current.username);

  next.firstname = first || fallbackFirstName(entity) || username || FALLBACK_AUTHOR_NAME;
  next.lastname = last;

  if (!next.username && username) {
    next.username = username;
  }

  if (!next.email && current.email) {
    next.email = current.email;
  }

  entity.authorUser = next;
};

const normalizeCommentNode = (node) => {
  if (!node || typeof node !== 'object') {
    return;
  }

  normalizeAuthorUser(node);

  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child) => normalizeCommentNode(child));
  }

  if (node.threadOf && typeof node.threadOf === 'object') {
    normalizeCommentNode(node.threadOf);
  }
};

const normalizeAdminPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const seen = new WeakSet();

  const visit = (value) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (seen.has(value)) {
      return;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item));
      return;
    }

    normalizeCommentNode(value);

    Object.keys(value).forEach((key) => {
      const child = value[key];
      if (child && typeof child === 'object') {
        visit(child);
      }
    });
  };

  visit(payload);
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

const coerceDocumentId = (post) => {
  if (!post) {
    return null;
  }

  if (typeof post.documentId === 'string' && post.documentId.trim().length > 0) {
    return post.documentId.trim();
  }

  if (typeof post.document_id === 'string' && post.document_id.trim().length > 0) {
    return post.document_id.trim();
  }

  return null;
};

const coerceRelationId = (post) => {
  if (!post) {
    return null;
  }

  const value = post.id ?? post.entryId ?? post.entry_id;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }

  return null;
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

  if (relationCache.has(identifier)) {
    return relationCache.get(identifier);
  }

  let relationId = null;

  if (NUMERIC_PATTERN.test(identifier)) {
    const post = await fetchPostByWhere({ id: Number(identifier) });
    relationId = coerceRelationId(post);
  }

  if (!relationId) {
    const direct = await fetchPostByWhere({
      $or: [
        { documentId: identifier },
        { document_id: identifier },
      ],
    });

    if (direct) {
      relationId = coerceRelationId(direct);
      if (!relationId) {
        const fallbackDocumentId = coerceDocumentId(direct) || identifier;
        if (NUMERIC_PATTERN.test(fallbackDocumentId)) {
          relationId = Math.trunc(Number(fallbackDocumentId));
        }
      }
    }
  }

  if (!relationId) {
    const bySlug = await fetchPostByWhere({ slug: identifier });
    relationId = coerceRelationId(bySlug);
  }

  relationCache.set(identifier, relationId);
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
    return relation;
  }

  return `${RELATION_PREFIX}${relationId}`;
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

export default (plugin) => {
  if (plugin?.controllers?.admin?.findAll) {
    const baseAdminFindAll = withSanitizedLimit(plugin.controllers.admin.findAll);

    plugin.controllers.admin.findAll = async function adminFindAllWithNormalization(ctx, next) {
      if (ctx?.state?.user && (ctx.state.user.lastname === null || ctx.state.user.lastname === undefined)) {
        ctx.state.user.lastname = '';
      }

      const result = await baseAdminFindAll.call(this, ctx, next);

      if (ctx?.body) {
        normalizeAdminPayload(ctx.body);
      }

      return result;
    };
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

  return plugin;
};
