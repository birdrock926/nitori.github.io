import crypto from 'node:crypto';
import sha256 from 'js-sha256';
import dayjs from 'dayjs';

const URL_REGEX = /(https?:\/\/[\w.-]+(?:\/[\w./?%&=+-]*)?)/gi;
const BANNED_WORDS = [
  '死ね',
  '殺す',
  '違法',
  'スパム',
  '差別',
  '暴言',
  'fuck',
  'shit',
];
const FLAGGED_WORDS = [
  '違法',
  '暴力',
  '殺す',
  '死ね',
  '詐欺',
  'スパム',
  '差別',
  '暴言',
  'ヘイト',
  '侮辱',
  'ばか',
  'バカ',
  '馬鹿',
  'くそ',
  '糞',
  'fuck',
  'shit',
  'bitch',
  'kill',
  'die',
];
const FLAGGED_PATTERNS = [
  { pattern: /[\u4e00-\u9faf]*差別/iu, label: '差別的表現' },
  { pattern: /暴言/iu, label: '暴言表現' },
  { pattern: /侮辱/iu, label: '侮辱的表現' },
  { pattern: /ヘイト/iu, label: 'ヘイトスピーチ' },
  { pattern: /fuck/i, label: 'fuck' },
  { pattern: /shit/i, label: 'shit' },
  { pattern: /bitch/i, label: 'bitch' },
  { pattern: /kill\s+you/i, label: 'kill you' },
  { pattern: /die\s+/i, label: 'die' },
];
const TRUSTED_LINK_HOSTS = [
  'youtube.com',
  'youtu.be',
  'twitch.tv',
  'www.youtube.com',
  'www.twitch.tv',
  'twitter.com',
];
const MAX_LINK_COUNT = 3;
const ALIAS_MIN_LENGTH = 2;
const ALIAS_MAX_LENGTH = 24;

const maskIp = (ip) => {
  if (!ip || typeof ip !== 'string') {
    return null;
  }
  if (ip.includes(':')) {
    const segments = ip.split(':');
    if (segments.length <= 2) {
      return ip;
    }
    return `${segments.slice(0, segments.length - 2).join(':')}::`; // mask last part of IPv6
  }
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return ip;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
};

const clampLength = (value, max = 512) => {
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > max ? value.slice(0, max) : value;
};

export const createClientMeta = ({ ip, ua, submittedAt }) => ({
  ip: clampLength(ip, 128),
  maskedIp: maskIp(ip),
  ua: clampLength(ua),
  submittedAt: submittedAt || new Date().toISOString(),
});

export const readClientMeta = (meta) => {
  if (!meta) {
    return {};
  }
  if (typeof meta === 'object' && (meta.ip || meta.ua || meta.maskedIp)) {
    return {
      ip: meta.ip || null,
      maskedIp: meta.maskedIp || maskIp(meta.ip),
      ua: meta.ua || null,
      submittedAt: meta.submittedAt || null,
    };
  }
  if (typeof meta === 'object' && meta.client) {
    return readClientMeta(meta.client);
  }
  return {};
};

export const sanitizeBody = (body = '') => body.trim();

export const extractLinks = (body) => {
  const matches = body.match(URL_REGEX);
  if (!matches) {
    return [];
  }
  return matches
    .map((link) => {
      try {
        const url = new URL(link);
        return url;
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
};

export const validateBody = (body) => {
  if (!body || typeof body !== 'string') {
    throw new Error('コメント本文が不正です');
  }
  const sanitized = sanitizeBody(body);
  if (sanitized.length < 1) {
    throw new Error('コメント本文が短すぎます');
  }
  if (sanitized.length > 2000) {
    throw new Error('コメント本文が長すぎます');
  }
  return sanitized;
};

const normaliseHost = (value) => value.replace(/^www\./, '').toLowerCase();

const mapReasons = ({ links, sanitized }) => {
  const reasons = [];

  const lower = sanitized.toLowerCase();
  const matchedWords = FLAGGED_WORDS.filter((word) => lower.includes(word.toLowerCase()));
  for (const { pattern, label } of FLAGGED_PATTERNS) {
    if (pattern.test(sanitized)) {
      matchedWords.push(label);
    }
  }
  const uniqueMatches = Array.from(new Set(matchedWords));
  if (uniqueMatches.length) {
    reasons.push({ type: 'word', matches: uniqueMatches });
  }

  if (links.length > MAX_LINK_COUNT) {
    reasons.push({ type: 'link-count', count: links.length });
  }

  const disallowedHosts = links
    .map((link) => normaliseHost(link.hostname))
    .filter((host) => !TRUSTED_LINK_HOSTS.some((allowed) => host === normaliseHost(allowed) || host.endsWith(`.${normaliseHost(allowed)}`)));

  if (disallowedHosts.length) {
    reasons.push({ type: 'link-host', hosts: Array.from(new Set(disallowedHosts)) });
  }

  return reasons;
};

export const evaluateModeration = (body) => {
  const sanitized = validateBody(body);
  const links = extractLinks(sanitized);
  const reasons = mapReasons({ links, sanitized });
  return {
    sanitized,
    requiresReview: reasons.length > 0,
    reasons,
    linkCount: links.length,
  };
};

export const hashIp = (ip, pepper) => sha256.hmac(pepper, ip || 'unknown');

export const networkHash = (ip, pepper) => {
  if (!ip) return sha256.hmac(pepper, 'unknown-net');
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return sha256.hmac(pepper, ip);
  }
  const net = `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return sha256.hmac(pepper, net);
};

export const sanitizeAliasInput = (alias) => {
  if (typeof alias !== 'string') {
    return null;
  }
  const trimmed = alias.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length < ALIAS_MIN_LENGTH) {
    throw new Error(`表示名は${ALIAS_MIN_LENGTH}文字以上で入力してください`);
  }
  if (trimmed.length > ALIAS_MAX_LENGTH) {
    throw new Error(`表示名は${ALIAS_MAX_LENGTH}文字以内で入力してください`);
  }
  for (const banned of BANNED_WORDS) {
    if (trimmed.includes(banned)) {
      throw new Error('表示名に禁止語が含まれています');
    }
  }
  return trimmed;
};

const formatAliasFromTemplate = (template, fragment) => {
  const safeTemplate = template?.trim() || '名無しのプレイヤーさん';
  if (safeTemplate.includes('{hash}')) {
    return safeTemplate.replaceAll('{hash}', fragment);
  }
  if (safeTemplate.includes('%s')) {
    return safeTemplate.replaceAll('%s', fragment);
  }
  return safeTemplate;
};

export const generateAlias = (ip, postId, aliasSalt, template) => {
  const hash = sha256(`${aliasSalt}:${ip}:${postId}:${dayjs().format('YYYYMMDD')}`);
  const aliasFragment = parseInt(hash.slice(0, 8), 16).toString(36).padStart(5, '0').slice(0, 4);
  return formatAliasFromTemplate(template, aliasFragment);
};

export const resolveAlias = ({ requestedAlias, template, ip, postId, aliasSalt }) => {
  const sanitized = sanitizeAliasInput(requestedAlias);
  if (sanitized) {
    return { alias: sanitized, provided: true };
  }
  return {
    alias: generateAlias(ip, postId, aliasSalt, template),
    provided: false,
  };
};

export const createEditKey = () => crypto.randomBytes(16).toString('hex');

export const hashEditKey = (editKey, pepper) => sha256.hmac(pepper, editKey);

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

export const enforceRateLimit = async (strapi, { ipHash, min, hour, day }) => {
  const now = dayjs();
  const windows = [
    { amount: 1, unit: 'minute', limit: min },
    { amount: 1, unit: 'hour', limit: hour },
    { amount: 1, unit: 'day', limit: day },
  ];
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

const extractDisplayMeta = (meta) => {
  if (!meta || typeof meta !== 'object') {
    return undefined;
  }

  const display = meta.display && typeof meta.display === 'object' ? meta.display : meta;
  const moderation = meta.moderation && typeof meta.moderation === 'object' ? meta.moderation : {};

  const result = {
    aliasColor: display.aliasColor,
    aliasLabel: display.aliasLabel,
    aliasProvided: display.aliasProvided,
    requiresReview: Boolean(moderation.requiresReview),
    moderatorFlagged: Boolean(moderation.moderatorFlagged),
  };

  if (typeof display.postTitle === 'string') {
    result.postTitle = display.postTitle;
  }

  if (typeof display.postSlug === 'string') {
    result.postSlug = display.postSlug;
  }

  if (typeof moderation.reportCount === 'number') {
    result.reportCount = moderation.reportCount;
  }

  if (Array.isArray(moderation.reasons)) {
    result.flaggedReasons = moderation.reasons;
  }

  return result;
};

export const buildCommentResponse = (comment) => ({
  id: comment.id,
  body: comment.body,
  alias: comment.alias,
  status: typeof comment.status === 'string' ? comment.status.toLowerCase() : 'pending',
  createdAt: comment.createdAt,
  isModerator: Boolean(comment.isModerator),
  meta: extractDisplayMeta(comment.meta),
  children: comment.children?.map((child) => buildCommentResponse(child)) || [],
});

export const paginateComments = async (strapi, { postId, limit, cursor }) => {
  const where = {
    post: postId,
    status: { $eqi: 'published' },
    parent: null,
  };
  if (cursor) {
    where.createdAt = { $lt: cursor };
  }
  const rootComments = await strapi.entityService.findMany('api::comment.comment', {
    filters: where,
    sort: { createdAt: 'desc' },
    limit,
    fields: ['id', 'body', 'alias', 'status', 'createdAt', 'isModerator', 'meta'],
    populate: {
      children: {
        filters: { status: { $eqi: 'published' } },
        sort: { createdAt: 'asc' },
        fields: ['id', 'body', 'alias', 'status', 'createdAt', 'isModerator', 'meta'],
      },
    },
  });
  const nextCursor = rootComments.length === limit ? rootComments[rootComments.length - 1].createdAt : null;
  return {
    data: rootComments.map(buildCommentResponse),
    nextCursor,
  };
};

export const toPublicComment = (comment) => ({
  id: comment.id,
  alias: comment.alias,
  body: comment.body,
  status: typeof comment.status === 'string' ? comment.status.toLowerCase() : 'pending',
  createdAt: comment.createdAt,
  isModerator: Boolean(comment.isModerator),
  meta: extractDisplayMeta(comment.meta),
  parent: comment.parent ? comment.parent.id : null,
});

