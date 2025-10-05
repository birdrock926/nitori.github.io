import { COMMENT_TEXT_LIMITS, FLAGGED_TERMS, FLAGGED_PATTERNS, MAX_LINK_COUNT, TRUSTED_LINK_HOSTS } from './constants.js';

const URL_REGEX = /(https?:\/\/[\w.-]+(?:\/[\w./?%&=+-]*)?)/gi;

const normaliseHost = (value) => value.replace(/^www\./, '').toLowerCase();

export const sanitizeBody = (body = '') => body.trim();

export const validateBody = (body) => {
  if (!body || typeof body !== 'string') {
    throw new Error('コメント本文が不正です');
  }
  const sanitized = sanitizeBody(body);
  if (sanitized.length < COMMENT_TEXT_LIMITS.MIN) {
    throw new Error('コメント本文が短すぎます');
  }
  if (sanitized.length > COMMENT_TEXT_LIMITS.MAX) {
    throw new Error('コメント本文が長すぎます');
  }
  return sanitized;
};

export const extractLinks = (body) => {
  const matches = body.match(URL_REGEX);
  if (!matches) {
    return [];
  }
  return matches
    .map((link) => {
      try {
        return new URL(link);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
};

const mapReasons = ({ links, sanitized }) => {
  const reasons = [];
  const lower = sanitized.toLowerCase();
  const matchedWords = FLAGGED_TERMS.filter((word) => lower.includes(word.toLowerCase()));
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
