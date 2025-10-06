const clampString = (value, max = 512) => {
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > max ? value.slice(0, max) : value;
};

const maskIp = (ip) => {
  if (!ip || typeof ip !== 'string') {
    return null;
  }
  if (ip.includes(':')) {
    const segments = ip.split(':');
    if (segments.length <= 2) {
      return ip;
    }
    return `${segments.slice(0, segments.length - 2).join(':')}::`;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return ip;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
};

export const createClientMeta = ({ ip, ua, submittedAt }) => ({
  ip: clampString(ip, 128),
  maskedIp: maskIp(ip),
  ua: clampString(ua),
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

export const mergeModerationMeta = (meta, updates = {}) => {
  const base = meta && typeof meta === 'object' ? { ...meta } : {};
  const moderation = base.moderation && typeof base.moderation === 'object' ? { ...base.moderation } : {};

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
  if (updates.score !== undefined) {
    moderation.score = updates.score;
  }
  if (updates.severity !== undefined) {
    moderation.severity = updates.severity;
  }

  base.moderation = moderation;
  return base;
};

export const extractDisplayMeta = (meta) => {
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

  if (typeof moderation.score === 'number') {
    result.moderationScore = moderation.score;
  }

  if (typeof moderation.severity === 'string') {
    result.moderationSeverity = moderation.severity;
  }

  return result;
};
