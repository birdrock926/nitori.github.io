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

export const FLAGGED_TERMS = [
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

export const FLAGGED_PATTERNS = [
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
