import { BANNED_TERMS, COMMENT_ALIAS_LIMITS, buildAliasFragment } from './constants.js';

export const sanitizeAliasInput = (alias) => {
  if (typeof alias !== 'string') {
    return null;
  }
  const trimmed = alias.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length < COMMENT_ALIAS_LIMITS.MIN) {
    throw new Error(`表示名は${COMMENT_ALIAS_LIMITS.MIN}文字以上で入力してください`);
  }
  if (trimmed.length > COMMENT_ALIAS_LIMITS.MAX) {
    throw new Error(`表示名は${COMMENT_ALIAS_LIMITS.MAX}文字以内で入力してください`);
  }
  for (const banned of BANNED_TERMS) {
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
  const fragment = buildAliasFragment({ ip, postId, aliasSalt });
  return formatAliasFromTemplate(template, fragment);
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
