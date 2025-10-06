import dayjs from 'dayjs';
import sha256 from 'js-sha256';

export const COMMENT_STATUSES = Object.freeze({
  PUBLISHED: 'published',
  PENDING: 'pending',
  HIDDEN: 'hidden',
  SHADOW: 'shadow',
});

export const COMMENT_STATUS_SET = new Set(Object.values(COMMENT_STATUSES));

export const AUTO_PUBLISH_MODES = Object.freeze({
  ALWAYS: 'always',
  SMART: 'smart',
  MANUAL: 'manual',
});

export const DEFAULT_AUTO_PUBLISH = AUTO_PUBLISH_MODES.SMART;

export const normalizeAutoPublishSetting = (value) => {
  if (value === undefined || value === null) {
    return DEFAULT_AUTO_PUBLISH;
  }
  const normalized = value.toString().trim().toLowerCase();
  if (['always', 'immediate', 'publish', 'force'].includes(normalized)) {
    return AUTO_PUBLISH_MODES.ALWAYS;
  }
  if (['manual', 'moderated', 'false', 'off', 'pending', 'review', 'hold'].includes(normalized)) {
    return AUTO_PUBLISH_MODES.MANUAL;
  }
  if (['smart', 'auto', 'automatic', 'true', 'on', 'yes'].includes(normalized)) {
    return AUTO_PUBLISH_MODES.SMART;
  }
  return DEFAULT_AUTO_PUBLISH;
};

export const COMMENT_ALIAS_LIMITS = Object.freeze({
  MIN: 2,
  MAX: 24,
});

export const COMMENT_TEXT_LIMITS = Object.freeze({
  MIN: 1,
  MAX: 2000,
});

export const MAX_LINK_COUNT = 3;

export const TRUSTED_LINK_HOSTS = [
  'youtube.com',
  'youtu.be',
  'twitch.tv',
  'www.youtube.com',
  'www.twitch.tv',
  'twitter.com',
];

export const BANNED_TERMS = [
  '死ね',
  '殺す',
  '違法',
  'スパム',
  '差別',
  '暴言',
  'fuck',
  'shit',
];

export const MODERATION_SEVERITY = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

export const MODERATION_SEVERITY_WEIGHTS = Object.freeze({
  [MODERATION_SEVERITY.NONE]: 0,
  [MODERATION_SEVERITY.LOW]: 3,
  [MODERATION_SEVERITY.MEDIUM]: 7,
  [MODERATION_SEVERITY.HIGH]: 12,
});

export const MODERATION_REVIEW_THRESHOLD = 7;

export const FLAGGED_WORD_RULES = [
  { term: '違法', label: '違法', severity: MODERATION_SEVERITY.HIGH },
  { term: '暴力', label: '暴力', severity: MODERATION_SEVERITY.HIGH },
  { term: '殺す', label: '殺す', severity: MODERATION_SEVERITY.HIGH },
  { term: '死ね', label: '死ね', severity: MODERATION_SEVERITY.HIGH },
  { term: '詐欺', label: '詐欺', severity: MODERATION_SEVERITY.MEDIUM },
  { term: 'スパム', label: 'スパム', severity: MODERATION_SEVERITY.MEDIUM },
  { term: '差別', label: '差別', severity: MODERATION_SEVERITY.HIGH },
  { term: '暴言', label: '暴言', severity: MODERATION_SEVERITY.MEDIUM },
  { term: 'ヘイト', label: 'ヘイト', severity: MODERATION_SEVERITY.HIGH },
  { term: '侮辱', label: '侮辱', severity: MODERATION_SEVERITY.MEDIUM },
  { term: 'ばか', label: 'ばか', severity: MODERATION_SEVERITY.LOW },
  { term: 'バカ', label: 'バカ', severity: MODERATION_SEVERITY.LOW },
  { term: '馬鹿', label: '馬鹿', severity: MODERATION_SEVERITY.LOW },
  { term: 'くそ', label: 'くそ', severity: MODERATION_SEVERITY.LOW },
  { term: '糞', label: '糞', severity: MODERATION_SEVERITY.LOW },
  { term: 'fuck', label: 'fuck', severity: MODERATION_SEVERITY.HIGH },
  { term: 'shit', label: 'shit', severity: MODERATION_SEVERITY.MEDIUM },
  { term: 'bitch', label: 'bitch', severity: MODERATION_SEVERITY.MEDIUM },
  { term: 'kill', label: 'kill', severity: MODERATION_SEVERITY.HIGH },
  { term: 'die', label: 'die', severity: MODERATION_SEVERITY.HIGH },
];

export const FLAGGED_PATTERNS = [
  { pattern: /[\u4e00-\u9faf]*差別/iu, label: '差別的表現', severity: MODERATION_SEVERITY.HIGH },
  { pattern: /暴言/iu, label: '暴言表現', severity: MODERATION_SEVERITY.MEDIUM },
  { pattern: /侮辱/iu, label: '侮辱的表現', severity: MODERATION_SEVERITY.MEDIUM },
  { pattern: /ヘイト/iu, label: 'ヘイトスピーチ', severity: MODERATION_SEVERITY.HIGH },
  { pattern: /fuck/i, label: 'fuck', severity: MODERATION_SEVERITY.HIGH },
  { pattern: /shit/i, label: 'shit', severity: MODERATION_SEVERITY.MEDIUM },
  { pattern: /bitch/i, label: 'bitch', severity: MODERATION_SEVERITY.MEDIUM },
  { pattern: /kill\s+you/i, label: 'kill you', severity: MODERATION_SEVERITY.HIGH },
  { pattern: /die\s+/i, label: 'die', severity: MODERATION_SEVERITY.HIGH },
];

export const RATE_LIMIT_WINDOWS = [
  { amount: 1, unit: 'minute', env: 'RATE_LIMITS_MIN', defaultLimit: 5 },
  { amount: 1, unit: 'hour', env: 'RATE_LIMITS_HOUR', defaultLimit: 30 },
  { amount: 1, unit: 'day', env: 'RATE_LIMITS_DAY', defaultLimit: 200 },
];

export const buildAliasFragment = ({ ip, postId, aliasSalt }) => {
  const seed = `${aliasSalt}:${ip}:${postId}:${dayjs().format('YYYYMMDD')}`;
  const hash = sha256(seed);
  return parseInt(hash.slice(0, 8), 16).toString(36).padStart(5, '0').slice(0, 4);
};
