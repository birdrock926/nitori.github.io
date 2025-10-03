import crypto from 'node:crypto';
import sha256 from 'js-sha256';
import dayjs from 'dayjs';

const URL_REGEX = /(https?:\/\/[\w.-]+(?:\/[\w./?%&=+-]*)?)/gi;
const BANNED_WORDS = ['死ね', '殺す', '違法', 'スパム'];
const ALLOWED_HOSTS = ['youtube.com', 'youtu.be', 'twitch.tv', 'www.youtube.com', 'www.twitch.tv'];
const ALIAS_MIN_LENGTH = 2;
const ALIAS_MAX_LENGTH = 24;

const DEFAULT_CLIENT_SECRET = 'comment-ip-secret';

const resolveClientSecret = () => {
  if (process.env.COMMENT_IP_SECRET) {
    return process.env.COMMENT_IP_SECRET;
  }
  if (process.env.HASH_PEPPER) {
    return process.env.HASH_PEPPER;
  }
  if (process.env.APP_KEYS) {
    try {
      const parsed = JSON.parse(process.env.APP_KEYS);
      if (Array.isArray(parsed) && parsed[0]) {
        return parsed[0];
      }
    } catch (error) {
      // ignore malformed JSON, fall through to default
    }
  }
  return DEFAULT_CLIENT_SECRET;
};

const deriveCipherKey = (secret) =>
  crypto
    .createHash('sha256')
    .update(secret)
    .digest()
    .subarray(0, 32);

export const encryptClientPayload = ({ ip, ua, submittedAt }) => {
  const secret = resolveClientSecret();
  const key = deriveCipherKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const payload = JSON.stringify({ ip, ua, submittedAt });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`,
    submittedAt,
  };
};

export const decryptClientPayload = (meta) => {
  if (!meta) {
    return {};
  }

  const encoded =
    typeof meta === 'string'
      ? meta
      : typeof meta === 'object' && typeof meta.encrypted === 'string'
      ? meta.encrypted
      : null;

  if (!encoded) {
    return typeof meta === 'object' ? meta : {};
  }

  try {
    const [ivEncoded, tagEncoded, dataEncoded] = encoded.split('.');
    if (!ivEncoded || !tagEncoded || !dataEncoded) {
      return {};
    }
    const secret = resolveClientSecret();
    const key = deriveCipherKey(secret);
    const iv = Buffer.from(ivEncoded, 'base64');
    const authTag = Buffer.from(tagEncoded, 'base64');
    const encrypted = Buffer.from(dataEncoded, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(decrypted);
    return typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
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
  if (sanitized.length < 3) {
    throw new Error('コメント本文が短すぎます');
  }
  if (sanitized.length > 2000) {
    throw new Error('コメント本文が長すぎます');
  }

  const lower = sanitized.toLowerCase();
  for (const banned of BANNED_WORDS) {
    if (lower.includes(banned.toLowerCase())) {
      throw new Error('禁止語句が含まれています');
    }
  }

  const links = extractLinks(sanitized);
  if (links.length > 3) {
    throw new Error('URL は 3 件までです');
  }
  for (const link of links) {
    if (!ALLOWED_HOSTS.some((host) => link.hostname.endsWith(host))) {
      throw new Error('許可されていないドメインへのリンクがあります');
    }
  }

  return sanitized;
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
  if (!meta) return undefined;
  if (typeof meta !== 'object') return undefined;
  if (meta.display && typeof meta.display === 'object') {
    const { aliasColor, aliasLabel, aliasProvided } = meta.display;
    return { aliasColor, aliasLabel, aliasProvided };
  }
  const { aliasColor, aliasLabel, aliasProvided } = meta;
  return { aliasColor, aliasLabel, aliasProvided };
};

export const buildCommentResponse = (comment) => ({
  id: comment.id,
  body: comment.body,
  alias: comment.alias,
  status: comment.status,
  createdAt: comment.createdAt,
  isModerator: Boolean(comment.isModerator),
  meta: extractDisplayMeta(comment.meta),
  children: comment.children?.map((child) => buildCommentResponse(child)) || [],
});

export const paginateComments = async (strapi, { postId, limit, cursor }) => {
  const where = {
    post: postId,
    status: 'published',
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
        filters: { status: 'published' },
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
  status: comment.status,
  createdAt: comment.createdAt,
  isModerator: Boolean(comment.isModerator),
  meta: extractDisplayMeta(comment.meta),
  parent: comment.parent ? comment.parent.id : null,
});

