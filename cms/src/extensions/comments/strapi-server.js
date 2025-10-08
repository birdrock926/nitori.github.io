const RELATION_PREFIX = 'api::post.post:';
const POST_UID = 'api::post.post';
const NUMERIC_PATTERN = /^\d+$/;

const relationCache = new Map();

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

const fetchPostByWhere = async (where) => {
  try {
    return await strapi.db.query(POST_UID).findOne({ where, select: ['id', 'documentId', 'document_id', 'slug'] });
  } catch (error) {
    strapi.log.error('[comments] Failed to resolve post for comments relation normalization.', error);
    return null;
  }
};

const resolveDocumentId = async (identifier) => {
  if (!identifier) {
    return null;
  }

  if (relationCache.has(identifier)) {
    return relationCache.get(identifier);
  }

  let documentId = null;

  if (NUMERIC_PATTERN.test(identifier)) {
    const post = await fetchPostByWhere({ id: Number(identifier) });
    documentId = coerceDocumentId(post);
  }

  if (!documentId) {
    const direct = await fetchPostByWhere({
      $or: [
        { documentId: identifier },
        { document_id: identifier },
      ],
    });

    if (direct) {
      documentId = coerceDocumentId(direct) || identifier;
    }
  }

  if (!documentId) {
    const bySlug = await fetchPostByWhere({ slug: identifier });
    documentId = coerceDocumentId(bySlug);
  }

  relationCache.set(identifier, documentId);
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

  const documentId = await resolveDocumentId(identifier);
  if (!documentId) {
    return relation;
  }

  return `${RELATION_PREFIX}${documentId}`;
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
  if (plugin?.controllers?.client?.post) {
    const basePost = plugin.controllers.client.post;

    plugin.controllers.client.post = async function postWithNormalizedRelation(ctx, next) {
      if (ctx?.params?.relation) {
        ctx.params.relation = await normalizeRelation(ctx.params.relation);
      }

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

      return baseReportAbuse.call(this, normalizedParams, user);
    };
  }

  return plugin;
};
