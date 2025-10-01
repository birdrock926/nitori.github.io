import { factories } from '@strapi/strapi';
import dayjs from 'dayjs';
import {
  validateBody,
  hashIp,
  networkHash,
  generateAlias,
  createEditKey,
  hashEditKey,
  isBanned,
  enforceRateLimit,
  detectSimilarity,
  paginateComments,
  toPublicComment,
} from '../../../utils/comment.js';
import { verifyCaptcha } from '../../../utils/captcha.js';

const REPORT_THRESHOLD = 3;
const MIN_SUBMIT_INTERVAL_MS = 3000;

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

export default factories.createCoreController('api::comment.comment', ({ strapi }) => ({
  async submit(ctx) {
    const { postSlug, parentId, body, captchaToken, honeypot, sentAt } = ctx.request.body || {};
    if (honeypot) {
      return ctx.badRequest('bot-detected');
    }
    const now = Date.now();
    if (sentAt && now - Number(sentAt) < MIN_SUBMIT_INTERVAL_MS) {
      return ctx.badRequest('投稿が早すぎます');
    }
    if (!postSlug) {
      return ctx.badRequest('記事が指定されていません');
    }
    const post = await strapi.entityService.findMany('api::post.post', {
      filters: { slug: postSlug, publishedAt: { $notNull: true } },
      limit: 1,
    });
    if (!post?.length) {
      return ctx.notFound('記事が見つかりません');
    }
    const postId = post[0].id;

    const sanitizedBody = validateBody(body);

    const ip = getClientIp(ctx) || '0.0.0.0';
    const ua = getUserAgent(ctx);
    const pepper = resolvePepper(strapi);
    const aliasSalt = resolveAliasSalt();
    const ipHash = hashIp(ip, pepper);
    const netHash = networkHash(ip, pepper);

    if (await isBanned(strapi, { ipHash, netHash })) {
      return ctx.forbidden('BAN されています');
    }

    const captchaProvider = process.env.CAPTCHA_PROVIDER || 'turnstile';
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

    const alias = generateAlias(ip, postId, aliasSalt);
    const editKeyPlain = createEditKey();
    const editKeyHash = hashEditKey(editKeyPlain, pepper);

    const record = await strapi.entityService.create('api::comment.comment', {
      data: {
        post: postId,
        parent: parent ? parent.id : null,
        body: sanitizedBody,
        alias,
        ip_hash: ipHash,
        net_hash: netHash,
        edit_key_hash: editKeyHash,
        status: 'pending',
        meta: {
          ua,
          submittedAt: dayjs().toISOString(),
        },
      },
      populate: { parent: true },
    });

    return {
      data: {
        comment: toPublicComment(record),
        editKey: editKeyPlain,
      },
    };
  },

  async list(ctx) {
    const { postSlug, cursor, limit = 20 } = ctx.query || {};
    if (!postSlug) {
      return ctx.badRequest('記事が指定されていません');
    }
    const post = await strapi.entityService.findMany('api::post.post', {
      filters: { slug: postSlug, publishedAt: { $notNull: true } },
      limit: 1,
    });
    if (!post?.length) {
      return ctx.notFound('記事が見つかりません');
    }
    const postId = post[0].id;
    const { data, nextCursor } = await paginateComments(strapi, {
      postId,
      cursor,
      limit: Math.min(Number(limit) || 20, 50),
    });
    return { data, nextCursor };
  },

  async report(ctx) {
    const { id } = ctx.params;
    const { reason } = ctx.request.body || {};
    if (!id || !reason) {
      return ctx.badRequest('通報内容が不正です');
    }
    const comment = await strapi.entityService.findOne('api::comment.comment', id);
    if (!comment) {
      return ctx.notFound('コメントが存在しません');
    }
    const reporterKey = ctx.cookies.get('reporter_key') || createEditKey();
    await strapi.entityService.create('api::report.report', {
      data: {
        comment: id,
        reason,
        reporter_key: reporterKey,
      },
    });
    const reportCount = await strapi.entityService.count('api::report.report', {
      filters: {
        comment: id,
      },
    });
    if (reportCount >= REPORT_THRESHOLD && comment.status === 'published') {
      await strapi.entityService.update('api::comment.comment', id, {
        data: { status: 'hidden' },
      });
    }
    ctx.cookies.set('reporter_key', reporterKey, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
    return { ok: true };
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
    const { id } = ctx.params;
    await strapi.entityService.update('api::comment.comment', id, {
      data: { status: 'published' },
    });
    return { ok: true };
  },

  async hide(ctx) {
    const { id } = ctx.params;
    await strapi.entityService.update('api::comment.comment', id, {
      data: { status: 'hidden' },
    });
    return { ok: true };
  },

  async shadow(ctx) {
    const { id } = ctx.params;
    await strapi.entityService.update('api::comment.comment', id, {
      data: { status: 'shadow' },
    });
    return { ok: true };
  },
}));
