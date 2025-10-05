import dayjs from 'dayjs';
import { RATE_LIMIT_WINDOWS } from './constants.js';

export const isBanned = async (strapi, { ipHash, netHash }) => {
  const nowIso = new Date().toISOString();
  const results = await strapi.entityService.findMany('api::ban.ban', {
    filters: {
      $and: [
        {
          $or: [{ ip_hash: ipHash }, { net_hash: netHash }],
        },
        {
          $or: [{ expiresAt: null }, { expiresAt: { $gt: nowIso } }],
        },
      ],
    },
  });
  return results.length > 0;
};

const resolveWindowLimit = ({ env, defaultLimit }) => {
  const fromEnv = process.env[env];
  if (fromEnv === undefined) {
    return defaultLimit;
  }
  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) ? parsed : defaultLimit;
};

export const enforceRateLimit = async (strapi, { ipHash, overrides = {} }) => {
  const windows = RATE_LIMIT_WINDOWS.map((window) => ({
    amount: window.amount,
    unit: window.unit,
    limit: overrides[window.unit] ?? resolveWindowLimit(window),
  }));

  const now = dayjs();
  for (const { amount, unit, limit } of windows) {
    if (!limit) continue;
    const from = now.subtract(amount, unit).toISOString();
    const count = await strapi.entityService.count('api::comment.comment', {
      filters: {
        createdAt: { $gt: from },
        ip_hash: ipHash,
      },
    });
    if (count >= limit) {
      throw new Error('投稿レート制限に達しました');
    }
  }
};

export const detectSimilarity = async (strapi, { ipHash, body }) => {
  const recent = await strapi.entityService.findMany('api::comment.comment', {
    filters: {
      ip_hash: ipHash,
    },
    sort: { createdAt: 'desc' },
    limit: 5,
  });
  for (const item of recent) {
    const prev = item.body || '';
    const shorter = prev.length < body.length ? prev : body;
    const longer = prev.length < body.length ? body : prev;
    if (!longer.length) continue;
    let same = 0;
    for (let i = 0; i < shorter.length; i += 1) {
      if (shorter[i] === longer[i]) same += 1;
    }
    const ratio = same / longer.length;
    if (ratio > 0.9) {
      throw new Error('類似した投稿が検出されました');
    }
  }
};
