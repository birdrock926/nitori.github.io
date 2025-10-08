const mapReportReason = (value) => {
  if (value === undefined || value === null) {
    return 'OTHER';
  }

  const raw = String(value).trim();
  if (!raw) {
    return 'OTHER';
  }

  const upper = raw.toUpperCase();
  const normalized = raw.replace(/\s+/g, '').toLowerCase();

  const isBadLanguage =
    ['BAD_LANGUAGE', 'ABUSE', 'HARASSMENT', 'INSULT', 'OFFENSIVE', 'THREATS'].includes(upper) ||
    /中傷|ハラスメント|暴言|誹謗|侮辱/.test(raw);

  if (isBadLanguage) {
    return 'BAD_LANGUAGE';
  }

  const isDiscrimination =
    ['DISCRIMINATION', 'HATE', 'RACISM', 'SEXISM', 'HOMOPHOBIA', 'TRANSPHOBIA'].includes(upper) ||
    /差別|ヘイト|偏見|排除/.test(raw);

  if (isDiscrimination) {
    return 'DISCRIMINATION';
  }

  const isOther =
    ['OTHER', 'SPAM', 'ILLEGAL', 'DANGEROUS', 'ADVERTISEMENT', 'PROMOTION'].includes(upper) ||
    /スパム|宣伝|広告|違法|危険/.test(raw) ||
    normalized === 'other';

  if (isOther) {
    return 'OTHER';
  }

  return 'OTHER';
};

const annotateContent = (content, original) => {
  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  const annotation = original ? `選択された通報理由 (原文): ${original}` : '';

  if (!annotation) {
    return trimmedContent || undefined;
  }

  if (trimmedContent.includes(annotation)) {
    return trimmedContent;
  }

  return trimmedContent ? `${trimmedContent}\n\n${annotation}` : annotation;
};

export default (plugin) => {
  if (plugin?.services?.client?.reportAbuse) {
    const baseReportAbuse = plugin.services.client.reportAbuse;

    plugin.services.client.reportAbuse = async function reportAbuseWithNormalization(params = {}, user) {
      const normalizedParams = { ...params };

      if (normalizedParams.reason !== undefined) {
        const originalReason = normalizedParams.reason;
        const mapped = mapReportReason(originalReason);
        normalizedParams.reason = mapped;

        const canonicalOriginal =
          typeof originalReason === 'string' ? originalReason.trim().toUpperCase() : undefined;

        if (typeof originalReason === 'string' && canonicalOriginal !== mapped) {
          normalizedParams.content = annotateContent(normalizedParams.content, originalReason.trim());
        }
      }

      return baseReportAbuse.call(this, normalizedParams, user);
    };
  }

  return plugin;
};
