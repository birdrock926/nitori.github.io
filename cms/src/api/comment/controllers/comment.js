import { factories } from '@strapi/strapi';
import dayjs from 'dayjs';
import {
  validateBody,
  evaluateModeration,
  hashIp,
  networkHash,
  resolveAlias,
  createEditKey,
  hashEditKey,
  isBanned,
  enforceRateLimit,
  detectSimilarity,
  paginateComments,
  toPublicComment,
  createClientMeta,
  readClientMeta,
} from '../../../utils/comment.js';
import { verifyCaptcha } from '../../../utils/captcha.js';

const REPORT_THRESHOLD = 3;
const REPORT_REASONS = ['spam', 'abuse', 'copyright', 'other'];

const isSecureRequest = (ctx) => {
  if (typeof ctx.secure === 'boolean') {
    return ctx.secure;
  }
  const forwarded = ctx.request?.header?.['x-forwarded-proto'];
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() === 'https';
  }
  return false;
};

const cloneMeta = (meta) => {
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch (error) {
    return { ...meta };
  }
};

const mergeModerationMeta = (meta, updates = {}) => {
  const cloned = cloneMeta(meta);
  const moderation = cloned.moderation && typeof cloned.moderation === 'object' ? { ...cloned.moderation } : {};
  if (updates.reportCount !== undefined) {
    moderation.reportCount = updates.reportCount;
  }
  if (updates.moderatorFlagged !== undefined) {
    moderation.moderatorFlagged = updates.moderatorFlagged;
  }
  if (updates.requiresReview !== undefined) {
    moderation.requiresReview = updates.requiresReview;
  }
  if (updates.reasons !== undefined) {
    moderation.reasons = updates.reasons;
  }
  cloned.moderation = moderation;
  return cloned;
};
const getClientIp = (ctx) =>
  ctx.request.headers['cf-connecting-ip'] ||
  ctx.request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  ctx.request.ip;

const getUserAgent = (ctx) => ctx.request.headers['user-agent'] || 'unknown';

const resolvePepper = (strapi) => {
  const keys = strapi.config.get('server.app.keys', []);
  return process.env.HASH_PEPPER || keys[0] || 'hash-pepper';
};

const resolveAliasSalt = () => process.env.ALIAS_SALT || 'alias-salt';

const sanitizeSlug = (value = '') =>
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
  const sanitized = sanitizeSlug(raw);
  return Array.from(new Set([raw, lower, sanitized].filter(Boolean)));
};

const findPublishedPostBySlug = async (strapi, slug) => {
  const candidates = collectSlugCandidates(slug);
  if (!candidates.length) {
    return null;
  }

  const entry = await strapi.db.query('api::post.post').findOne({
    where: {
      slug: { $in: candidates },
      publishedAt: { $notNull: true },
    },
    select: ['id', 'slug', 'commentAliasDefault'],
  });

  return entry ?? null;
};

export default factories.createCoreController('api::comment.comment', ({ strapi }) => {
  const changeStatus = async (ctx, status, metaUpdates) => {
    const { id } = ctx.params;
    if (!id) {
      return ctx.badRequest('ID が必要です');
    }
    const comment = await strapi.entityService.findOne('api::comment.comment', id, {
      fields: ['id', 'meta'],
    });
    if (!comment) {
      return ctx.notFound('コメントが存在しません');
    }
    const data = { status };
    if (metaUpdates) {
      data.meta = mergeModerationMeta(comment.meta, metaUpdates);
    }
    await strapi.entityService.update('api::comment.comment', id, { data });
    return { ok: true };
  };

  return {
  async submit(ctx) {
    const { postSlug, parentId, body, alias: aliasInput, captchaToken, honeypot } =
      ctx.request.body || {};
    if (honeypot) {
      return ctx.badRequest('bot-detected');
    }
    if (!postSlug) {
      return ctx.badRequest('記事が指定されていません');
    }
    const postEntry = await findPublishedPostBySlug(strapi, postSlug);
    if (!postEntry) {
      return ctx.notFound('記事が見つかりません');
    }
    const postId = postEntry.id;

    const { sanitized: sanitizedBody, requiresReview, reasons } = evaluateModeration(body);

    const ip = getClientIp(ctx) || '0.0.0.0';
    const ua = getUserAgent(ctx);
    const submittedAtIso = dayjs().toISOString();
    const pepper = resolvePepper(strapi);
    const aliasSalt = resolveAliasSalt();
    const ipHash = hashIp(ip, pepper);
    const netHash = networkHash(ip, pepper);

    if (await isBanned(strapi, { ipHash, netHash })) {
      return ctx.forbidden('BAN されています');
    }

    const captchaProvider = process.env.CAPTCHA_PROVIDER || 'none';
    const captchaSecret = process.env.CAPTCHA_SECRET || '';
    await verifyCaptcha({ provider: captchaProvider, secret: captchaSecret, token: captchaToken, remoteip: ip });

    await enforceRateLimit(strapi, {
      ipHash,
      min: Number(process.env.RATE_LIMITS_MIN || 5),
      hour: Number(process.env.RATE_LIMITS_HOUR || 30),
      day: Number(process.env.RATE_LIMITS_DAY || 200),
    });

    await detectSimilarity(strapi, { ipHash, body: sanitizedBody });

    let parent = null;
    if (parentId) {
      parent = await strapi.entityService.findOne('api::comment.comment', parentId, {
        populate: { post: true },
      });
      if (!parent || parent.post?.id !== postId) {
        return ctx.badRequest('返信先が不正です');
      }
    }

    let aliasData;
    try {
      aliasData = resolveAlias({
        requestedAlias: aliasInput,
        template: postEntry.commentAliasDefault,
        ip,
        postId,
        aliasSalt,
      });
    } catch (error) {
      return ctx.badRequest(error.message);
    }
    const alias = aliasData.alias;
    const editKeyPlain = createEditKey();
    const editKeyHash = hashEditKey(editKeyPlain, pepper);

    const shouldAutoPublish =
      process.env.COMMENTS_AUTO_PUBLISH === 'true' || strapi.config.get('environment') === 'development';
    const requiresManualReview = requiresReview || !shouldAutoPublish;

    const record = await strapi.entityService.create('api::comment.comment', {
      data: {
        post: postId,
        parent: parent ? parent.id : null,
        body: sanitizedBody,
        alias,
        isModerator: false,
        ip_hash: ipHash,
        net_hash: netHash,
        edit_key_hash: editKeyHash,
        status: shouldAutoPublish && !requiresReview ? 'published' : 'pending',
        meta: {
          client: createClientMeta({ ip, ua, submittedAt: submittedAtIso }),
          display: {
            aliasProvided: aliasData.provided,
          },
          moderation: {
            requiresReview,
            reasons,
            reportCount: 0,
            moderatorFlagged: false,
          },
        },
      },
      populate: { parent: true },
    });

    const publicComment = toPublicComment(record);

    if (requiresManualReview) {
      publicComment.status = 'pending';
    }

    return {
      data: {
        comment: publicComment,
        editKey: editKeyPlain,
      },
    };
  },

  async list(ctx) {
    const { postSlug, cursor, limit = 20 } = ctx.query || {};
    if (!postSlug) {
      return ctx.badRequest('記事が指定されていません');
    }
    const post = await findPublishedPostBySlug(strapi, postSlug);
    if (!post) {
      return ctx.notFound('記事が見つかりません');
    }
    const postId = post.id;
    const { data, nextCursor } = await paginateComments(strapi, {
      postId,
      cursor,
      limit: Math.min(Number(limit) || 20, 50),
    });
    return { data, nextCursor };
  },

  async moderatorMeta(ctx) {
    const { id } = ctx.params;
    if (!id) {
      return ctx.badRequest('ID が必要です');
    }
    const comment = await strapi.entityService.findOne('api::comment.comment', id, {
      fields: ['id', 'body', 'alias', 'status', 'createdAt', 'ip_hash', 'net_hash', 'meta'],
      populate: { post: { fields: ['id', 'title', 'slug'] } },
    });
    if (!comment) {
      return ctx.notFound('コメントが見つかりません');
    }

    const clientMeta = readClientMeta(comment.meta?.client);
    const moderationMeta =
      comment.meta?.moderation && typeof comment.meta.moderation === 'object'
        ? comment.meta.moderation
        : {};

    return {
      data: {
        id: comment.id,
        body: comment.body,
        alias: comment.alias,
        status: comment.status,
        createdAt: comment.createdAt,
        ip: clientMeta.ip || null,
        ipHash: comment.ip_hash || null,
        netHash: comment.net_hash || null,
        userAgent: clientMeta.ua || null,
        submittedAt: clientMeta.submittedAt || comment.createdAt,
        moderation: {
          reportCount: moderationMeta.reportCount ?? 0,
          requiresReview: Boolean(moderationMeta.requiresReview),
          moderatorFlagged: Boolean(moderationMeta.moderatorFlagged),
          reasons: Array.isArray(moderationMeta.reasons) ? moderationMeta.reasons : [],
        },
        encryptedClient: typeof comment.meta?.client?.encrypted === 'string'
          ? comment.meta.client.encrypted
          : null,
        post: comment.post
          ? { id: comment.post.id, title: comment.post.title, slug: comment.post.slug }
          : null,
      },
    };
  },

  async banFromComment(ctx) {
    const { id } = ctx.params;
    if (!id) {
      return ctx.badRequest('ID が必要です');
    }
    const { reason, expiresAt, scope = 'both', purge = true } = ctx.request.body || {};
    const normalizedScope = String(scope || 'both').toLowerCase();

    const comment = await strapi.entityService.findOne('api::comment.comment', id, {
      populate: { post: true },
    });

    if (!comment) {
      return ctx.notFound('コメントが見つかりません');
    }

    const filters = [];
    const banData = {
      reason: reason || 'モデレーターによる BAN',
    };

    if ((normalizedScope === 'both' || normalizedScope === 'ip') && comment.ip_hash) {
      banData.ip_hash = comment.ip_hash;
      filters.push({ ip_hash: comment.ip_hash });
    }

    if ((normalizedScope === 'both' || normalizedScope === 'net') && comment.net_hash) {
      banData.net_hash = comment.net_hash;
      filters.push({ net_hash: comment.net_hash });
    }

    if (!filters.length) {
      return ctx.badRequest('BAN に必要な情報が不足しています');
    }

    if (expiresAt) {
      banData.expiresAt = expiresAt;
    }

    const existing = await strapi.entityService.findMany('api::ban.ban', {
      filters: {
        $or: filters,
      },
      limit: 1,
    });

    let banRecord;
    if (existing.length) {
      banRecord = await strapi.entityService.update('api::ban.ban', existing[0].id, { data: banData });
    } else {
      banRecord = await strapi.entityService.create('api::ban.ban', { data: banData });
    }

    let removedCount = 0;
    if (purge) {
      const { count } = await strapi.db.query('api::comment.comment').deleteMany({
        where: { $or: filters },
      });
      removedCount = count || 0;
    }

    return {
      data: {
        ban: banRecord,
        removedCount,
      },
    };
  },

  async report(ctx) {
    const { id } = ctx.params;
    const { reason } = ctx.request.body || {};
    if (!id || !reason || !REPORT_REASONS.includes(reason)) {
      return ctx.badRequest('通報理由を選択してください');
    }
    const comment = await strapi.entityService.findOne('api::comment.comment', id, {
      fields: ['id', 'status', 'meta'],
      populate: {},
    });
    if (!comment) {
      return ctx.notFound('コメントが存在しません');
    }
    const reporterKey = ctx.cookies.get('reporter_key') || createEditKey();
    const ip = getClientIp(ctx) || '0.0.0.0';
    const pepper = resolvePepper(strapi);
    const ipHash = hashIp(ip, pepper);
    const existing = await strapi.entityService.findMany('api::report.report', {
      filters: {
        comment: id,
        $or: [{ reporter_key: reporterKey }, { ip_hash: ipHash }],
      },
      limit: 1,
    });

    let alreadyReported = false;
    const reporterKeyForRecord = existing[0]?.reporter_key || reporterKey;

    if (existing.length) {
      alreadyReported = true;
      await strapi.entityService.update('api::report.report', existing[0].id, {
        data: { reason, ip_hash: ipHash },
      });
    } else {
      await strapi.entityService.create('api::report.report', {
        data: {
          comment: id,
          reason,
          reporter_key: reporterKeyForRecord,
          ip_hash: ipHash,
          byModerator: false,
        },
      });
    }

    const [reportCount, moderatorReports] = await Promise.all([
      strapi.entityService.count('api::report.report', { filters: { comment: id } }),
      strapi.entityService.count('api::report.report', { filters: { comment: id, byModerator: true } }),
    ]);

    const updatedMeta = mergeModerationMeta(comment.meta, {
      reportCount,
      moderatorFlagged: moderatorReports > 0,
      requiresReview: reportCount > 0,
    });

    const updatePayload = { meta: updatedMeta };
    if (reportCount >= REPORT_THRESHOLD && comment.status === 'published') {
      updatePayload.status = 'hidden';
    }

    await strapi.entityService.update('api::comment.comment', id, { data: updatePayload });

    ctx.cookies.set('reporter_key', reporterKeyForRecord, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(ctx),
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    return { ok: true, alreadyReported, reportCount };
  },

  async moderatorReport(ctx) {
    const { id } = ctx.params;
    const { reason = 'other' } = ctx.request.body || {};
    if (!id || !REPORT_REASONS.includes(reason)) {
      return ctx.badRequest('通報理由を選択してください');
    }

    const comment = await strapi.entityService.findOne('api::comment.comment', id, {
      fields: ['id', 'status', 'meta'],
      populate: {},
    });

    if (!comment) {
      return ctx.notFound('コメントが存在しません');
    }

    const reporterKey = `moderator:${ctx.state.user?.id ?? 'system'}`;

    const existing = await strapi.entityService.findMany('api::report.report', {
      filters: {
        comment: id,
        reporter_key: reporterKey,
      },
      limit: 1,
    });

    if (existing.length) {
      await strapi.entityService.update('api::report.report', existing[0].id, {
        data: { reason, byModerator: true },
      });
    } else {
      await strapi.entityService.create('api::report.report', {
        data: {
          comment: id,
          reason,
          reporter_key: reporterKey,
          byModerator: true,
        },
      });
    }

    const reportCount = await strapi.entityService.count('api::report.report', { filters: { comment: id } });

    const updatedMeta = mergeModerationMeta(comment.meta, {
      reportCount,
      moderatorFlagged: true,
      requiresReview: true,
    });

    const updatePayload = { meta: updatedMeta };
    if (comment.status === 'published') {
      updatePayload.status = 'hidden';
    }

    await strapi.entityService.update('api::comment.comment', id, { data: updatePayload });

    return { ok: true, reportCount };
  },

  async deleteOwn(ctx) {
    const { id } = ctx.params;
    const { edit_key: editKey } = ctx.request.body || {};
    if (!editKey) {
      return ctx.badRequest('編集キーが不正です');
    }
    const comment = await strapi.entityService.findOne('api::comment.comment', id);
    if (!comment) {
      return ctx.notFound('コメントが存在しません');
    }
    const pepper = resolvePepper(strapi);
    if (comment.edit_key_hash !== hashEditKey(editKey, pepper)) {
      return ctx.forbidden('編集キーが一致しません');
    }
    await strapi.entityService.update('api::comment.comment', id, {
      data: { status: 'hidden' },
    });
    return { ok: true };
  },

  async publish(ctx) {
    return changeStatus(ctx, 'published', { requiresReview: false, moderatorFlagged: false });
  },

  async hide(ctx) {
    return changeStatus(ctx, 'hidden');
  },

  async shadow(ctx) {
    return changeStatus(ctx, 'shadow', { moderatorFlagged: true });
  },
};
});
