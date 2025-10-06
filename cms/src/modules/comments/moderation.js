import {
  COMMENT_TEXT_LIMITS,
  FLAGGED_WORD_RULES,
  FLAGGED_PATTERNS,
  MAX_LINK_COUNT,
  TRUSTED_LINK_HOSTS,
  MODERATION_SEVERITY,
  MODERATION_SEVERITY_WEIGHTS,
  MODERATION_REVIEW_THRESHOLD,
} from './constants.js';

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

const severityRank = {
  [MODERATION_SEVERITY.NONE]: 0,
  [MODERATION_SEVERITY.LOW]: 1,
  [MODERATION_SEVERITY.MEDIUM]: 2,
  [MODERATION_SEVERITY.HIGH]: 3,
};

const calculateReasonScore = (severity, multiplier = 1) =>
  (MODERATION_SEVERITY_WEIGHTS[severity] || 0) * Math.max(multiplier, 1);

const mapReasons = ({ links, sanitized }) => {
  const reasons = [];
  const lower = sanitized.toLowerCase();

  const matchedWordEntries = FLAGGED_WORD_RULES.filter((rule) =>
    lower.includes(rule.term.toLowerCase())
  );

  if (matchedWordEntries.length) {
    const matches = Array.from(new Set(matchedWordEntries.map((rule) => rule.label)));
    const maxSeverity = matchedWordEntries.reduce(
      (highest, rule) => (severityRank[rule.severity] > severityRank[highest] ? rule.severity : highest),
      MODERATION_SEVERITY.LOW
    );
    reasons.push({
      type: 'word',
      matches,
      severity: maxSeverity,
      score: calculateReasonScore(maxSeverity, matches.length > 1 ? 1.2 : 1),
    });
  }

  const matchedPatternEntries = FLAGGED_PATTERNS.filter(({ pattern }) => pattern.test(sanitized));
  if (matchedPatternEntries.length) {
    const matches = Array.from(new Set(matchedPatternEntries.map((rule) => rule.label)));
    const maxSeverity = matchedPatternEntries.reduce(
      (highest, rule) => (severityRank[rule.severity] > severityRank[highest] ? rule.severity : highest),
      MODERATION_SEVERITY.LOW
    );
    reasons.push({
      type: 'pattern',
      matches,
      severity: maxSeverity,
      score: calculateReasonScore(maxSeverity, matches.length > 1 ? 1.1 : 1),
    });
  }

  if (links.length > MAX_LINK_COUNT) {
    reasons.push({
      type: 'link-count',
      count: links.length,
      severity: MODERATION_SEVERITY.MEDIUM,
      score: calculateReasonScore(MODERATION_SEVERITY.MEDIUM, links.length / MAX_LINK_COUNT),
    });
  }

  const disallowedHosts = links
    .map((link) => normaliseHost(link.hostname))
    .filter((host) =>
      !TRUSTED_LINK_HOSTS.some(
        (allowed) => host === normaliseHost(allowed) || host.endsWith(`.${normaliseHost(allowed)}`)
      )
    );

  if (disallowedHosts.length) {
    reasons.push({
      type: 'link-host',
      hosts: Array.from(new Set(disallowedHosts)),
      severity: MODERATION_SEVERITY.MEDIUM,
      score: calculateReasonScore(MODERATION_SEVERITY.MEDIUM, disallowedHosts.length / 2),
    });
  }

  return reasons;
};

export const evaluateModeration = (body) => {
  const sanitized = validateBody(body);
  const links = extractLinks(sanitized);
  const reasons = mapReasons({ links, sanitized });

  const totalScore = reasons.reduce((sum, reason) => sum + (reason.score || 0), 0);
  const highestSeverity = reasons.reduce(
    (highest, reason) =>
      severityRank[reason.severity || MODERATION_SEVERITY.NONE] > severityRank[highest]
        ? reason.severity
        : highest,
    MODERATION_SEVERITY.NONE
  );

  const requiresReview =
    totalScore >= MODERATION_REVIEW_THRESHOLD || highestSeverity === MODERATION_SEVERITY.HIGH;

  return {
    sanitized,
    requiresReview,
    reasons,
    linkCount: links.length,
    score: totalScore,
    severity: highestSeverity,
  };
};
