const RELATION_PREFIX = 'api::post.post:';
const POST_UID = 'api::post.post';
const NUMERIC_PATTERN = /^\d+$/;

const relationCache = new Map();
const FALLBACK_EMAIL_DOMAIN = 'comments.local';
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
const DEFAULT_COMMENT_LIMIT = 50;
const MAX_COMMENT_LIMIT = 200;
const PLACEHOLDER_SMTP_HOST_PATTERN = /(^|\.)example\.(?:com|net|org|dev)$/i;

const parseDelimitedList = (value) =>
  String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const STAFF_EMAILS = new Set(
  parseDelimitedList(process.env.COMMENTS_STAFF_EMAILS).map((email) => email.toLowerCase()),
);

const STAFF_EMAIL_DOMAINS = new Set(
  parseDelimitedList(process.env.COMMENTS_STAFF_EMAIL_DOMAINS).map((domain) =>
    domain.replace(/^@+/, '').toLowerCase(),
  ),
);

const STAFF_AUTHOR_IDS = new Set(
  parseDelimitedList(process.env.COMMENTS_STAFF_AUTHOR_IDS).map((id) => id.toLowerCase()),
);

const STAFF_BADGE_LABEL = process.env.COMMENTS_STAFF_BADGE_LABEL?.trim() || '運営';
const STAFF_KEYWORD_PATTERN =
  /(moderator|モデレーター|admin|staff|管理者|editor|official|運営|運營|运营|運営チーム|公式)/i;

const looksLikeCommentEntity = (value) =>
  value &&
  typeof value === 'object' &&
  (Object.prototype.hasOwnProperty.call(value, 'content') ||
    Object.prototype.hasOwnProperty.call(value, 'blocked') ||
    Object.prototype.hasOwnProperty.call(value, 'threadOf') ||
    Object.prototype.hasOwnProperty.call(value, 'thread_of'));

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

  const safeFallback = Number.isFinite(fallback) ? fallback : DEFAULT_COMMENT_LIMIT;
  const limitValue = Math.min(Math.max(normalized ?? safeFallback, 1), maximum);
  const serializedLimit = String(limitValue);

  const nextPagination = { ...(pagination || {}) };
  nextPagination.limit = limitValue;
  nextPagination.pageSize = limitValue;

  paginationAliasKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(nextPagination, key)) {
      nextPagination[key] = limitValue;
    }
  });

  query.pagination = nextPagination;
  query.limit = limitValue;

  aliasKeys.forEach((key) => {
    if (key !== 'limit' && Object.prototype.hasOwnProperty.call(query, key)) {
      query[key] = serializedLimit;
    }
  });

  return limitValue;
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const matchStaffKeyword = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return false;
  }
  return STAFF_KEYWORD_PATTERN.test(normalized);
};

const hasStaffDomain = (email) => {
  const normalized = normalizeString(email).toLowerCase();
  if (!normalized) {
    return false;
  }

  if (STAFF_EMAILS.has(normalized)) {
    return true;
  }

  const parts = normalized.split('@');
  if (parts.length === 2) {
    const domain = parts[1];
    if (STAFF_EMAIL_DOMAINS.has(domain)) {
      return true;
    }
  }

  return false;
};

const hasStaffAuthorId = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return false;
  }
  return STAFF_AUTHOR_IDS.has(normalized);
};

const ensureAuthorObject = (comment) => {
  if (!comment.author || typeof comment.author !== 'object') {
    comment.author = {};
  }
  return comment.author;
};

const isStaffComment = (comment) => {
  if (!comment || typeof comment !== 'object') {
    return false;
  }

  if (comment.isStaffResponse === true) {
    return true;
  }

  const authorUser = comment.authorUser ?? comment.author_user;
  if (authorUser) {
    return true;
  }

  const authorType = comment.authorType ?? comment.author_type;
  if (matchStaffKeyword(authorType)) {
    return true;
  }

  const authorId = comment.authorId ?? comment.author_id;
  if (hasStaffAuthorId(authorId)) {
    return true;
  }

  const author = comment.author && typeof comment.author === 'object' ? comment.author : null;
  if (!author) {
    return false;
  }

  if (author.moderator === true) {
    return true;
  }

  if (matchStaffKeyword(author.badge) || matchStaffKeyword(author.role) || matchStaffKeyword(author.type)) {
    return true;
  }

  if (Array.isArray(author.badges) && author.badges.some(matchStaffKeyword)) {
    return true;
  }

  if (Array.isArray(author.roles) && author.roles.some(matchStaffKeyword)) {
    return true;
  }

  if (hasStaffDomain(author.email)) {
    return true;
  }

  if (hasStaffAuthorId(author.id)) {
    return true;
  }

  return false;
};

const annotateCommentEntity = (entity) => {
  if (!entity || typeof entity !== 'object') {
    return entity;
  }

  if (entity.attributes && typeof entity.attributes === 'object') {
    annotateCommentEntity(entity.attributes);
  }

  if (!looksLikeCommentEntity(entity)) {
    return entity;
  }

  const comment = entity;

  if (Array.isArray(comment.children)) {
    comment.children = comment.children.map((child) => annotateCommentEntity(child));
  } else if (comment.children && typeof comment.children === 'object' && Array.isArray(comment.children.data)) {
    comment.children.data = comment.children.data.map((child) => annotateCommentEntity(child));
  }

  if (comment.threadOf && typeof comment.threadOf === 'object') {
    annotateCommentEntity(comment.threadOf);
  }

  if (!isStaffComment(comment)) {
    return comment;
  }

  const author = ensureAuthorObject(comment);
  author.moderator = true;

  const badges = new Set();
  if (typeof author.badge === 'string' && author.badge.trim().length > 0) {
    badges.add(author.badge.trim());
  }
  if (Array.isArray(author.badges)) {
    author.badges.forEach((badge) => {
      if (typeof badge === 'string' && badge.trim().length > 0) {
        badges.add(badge.trim());
      }
    });
  }
  badges.add(STAFF_BADGE_LABEL);
  const badgeList = Array.from(badges);
  author.badges = badgeList;
  author.badge = badgeList[0] || STAFF_BADGE_LABEL;

  const roles = new Set();
  if (typeof author.role === 'string' && author.role.trim().length > 0) {
    roles.add(author.role.trim());
  }
  if (Array.isArray(author.roles)) {
    author.roles.forEach((role) => {
      if (typeof role === 'string' && role.trim().length > 0) {
        roles.add(role.trim());
      }
    });
  }
  roles.add(STAFF_BADGE_LABEL);
  const roleList = Array.from(roles);
  author.roles = roleList;
  author.role = roleList[0] || STAFF_BADGE_LABEL;

  comment.isStaffResponse = true;

  return comment;
};

const annotateCommentPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => annotateCommentEntity(item));
  }

  if (looksLikeCommentEntity(payload)) {
    return annotateCommentEntity(payload);
  }

  ['data', 'results', 'items', 'comments'].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      return;
    }
    const value = payload[key];
    if (Array.isArray(value)) {
      payload[key] = value.map((item) => annotateCommentEntity(item));
    } else if (value && typeof value === 'object') {
      payload[key] = annotateCommentPayload(value);
    }
  });

  if (payload.result && typeof payload.result === 'object') {
    payload.result = annotateCommentPayload(payload.result);
  }

  return payload;
};

const wrapCommentsController = (controller, { sanitizeLimit = false, annotateResponse = true } = {}) => {
  if (typeof controller !== 'function') {
    return controller;
  }

  return async function enhancedCommentsController(ctx, next) {
    if (sanitizeLimit && ctx) {
      if (!ctx.query || typeof ctx.query !== 'object') {
        ctx.query = {};
      }

      sanitizeCommentsLimit(ctx.query);

      if (ctx.request && ctx.request.query && ctx.request.query !== ctx.query) {
        ctx.request.query = { ...ctx.request.query, ...ctx.query };
      }
    }

    const result = await controller.call(this, ctx, next);

    if (annotateResponse) {
      if (ctx && ctx.body) {
        ctx.body = annotateCommentPayload(ctx.body);
      }

      if (result && result !== ctx.body) {
        return annotateCommentPayload(result);
      }
    }

    return result;
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

const coerceDocumentId = (post) => {
  if (!post) {
    return null;
  }

  return normalizeRelationValue(post.documentId) ?? normalizeRelationValue(post.document_id);
};

const coerceRelationId = (post) => {
  if (!post) {
    return null;
  }

  const candidates = [post.id, post.documentId, post.document_id, post.entryId, post.entry_id];

  for (const candidate of candidates) {
    const normalized = normalizeRelationValue(candidate);
    if (normalized) {
      return normalized;
    }
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
    const numericId = Number(identifier);
    if (Number.isFinite(numericId)) {
      const postByNumber = await fetchPostByWhere({ id: numericId });
      relationId = coerceRelationId(postByNumber);
    }

    if (!relationId) {
      const postByString = await fetchPostByWhere({ id: identifier });
      relationId = coerceRelationId(postByString);
    }
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
        relationId = coerceDocumentId(direct);
      }
    }
  }

  if (!relationId) {
    const bySlug = await fetchPostByWhere({ slug: identifier });
    if (bySlug) {
      relationId = coerceRelationId(bySlug) ?? coerceDocumentId(bySlug);
    }
  }

  if (!relationId && NUMERIC_PATTERN.test(identifier)) {
    relationId = identifier.trim();
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
    plugin.controllers.admin.findAll = wrapCommentsController(plugin.controllers.admin.findAll, {
      sanitizeLimit: true,
      annotateResponse: false,
    });
  }

  if (plugin?.controllers?.client) {
    const sanitizeKeys = new Set(['findAll', 'findAllFlat', 'findAllInHierarchy', 'findAllPerAuthor']);

    Object.entries(plugin.controllers.client).forEach(([key, handler]) => {
      if (typeof handler !== 'function') {
        return;
      }

      if (key === 'post') {
        return;
      }

      const sanitizeLimit = sanitizeKeys.has(key);
      const annotateResponse = sanitizeLimit || key.startsWith('find');

      if (annotateResponse) {
        plugin.controllers.client[key] = wrapCommentsController(handler, {
          sanitizeLimit,
          annotateResponse,
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

      const response = await basePost(ctx, next);

      if (ctx && ctx.body) {
        ctx.body = annotateCommentPayload(ctx.body);
      }

      if (response && response !== ctx.body) {
        return annotateCommentPayload(response);
      }

      return response;
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

  return plugin;
};
