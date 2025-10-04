const NORMALIZED_STATUSES = new Set(['published', 'pending', 'hidden', 'shadow']);

const normalizeStatus = (value) => {
  if (typeof value !== 'string') {
    return 'pending';
  }
  const normalized = value.trim().toLowerCase();
  return NORMALIZED_STATUSES.has(normalized) ? normalized : 'pending';
};

const ensureModerationMeta = (meta = {}) => {
  const base = typeof meta === 'object' && meta !== null ? { ...meta } : {};
  const moderation =
    base.moderation && typeof base.moderation === 'object' && base.moderation !== null
      ? { ...base.moderation }
      : {};

  if (typeof moderation.reportCount !== 'number') {
    moderation.reportCount = Number.isFinite(moderation.reportCount)
      ? Number(moderation.reportCount)
      : 0;
  }

  base.moderation = moderation;
  return base;
};

const applyStatusSideEffects = (data) => {
  if (!data) return;
  if (data.status) {
    data.status = normalizeStatus(data.status);
  }

  if (!data.meta || typeof data.meta !== 'object' || data.meta === null) {
    data.meta = {};
  }

  data.meta = ensureModerationMeta(data.meta);

  if (data.status === 'published') {
    data.meta.moderation.requiresReview = false;
    data.meta.moderation.moderatorFlagged = false;
  }
};

export default {
  beforeCreate(event) {
    applyStatusSideEffects(event?.params?.data);
  },
  beforeUpdate(event) {
    applyStatusSideEffects(event?.params?.data);
  },
};
