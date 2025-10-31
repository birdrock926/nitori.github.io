import {
  sanitizeCommentsLimit,
  shouldSanitizeCommentsRequest,
  syncQueryContext,
} from '../extensions/comments/utils/limit.js';

const ensureObject = (value) => (value && typeof value === 'object' ? value : {});

export default () => {
  return async (ctx, next) => {
    if (!shouldSanitizeCommentsRequest(ctx)) {
      return next();
    }

    ctx.query = ensureObject(ctx.query);
    ctx.state = ensureObject(ctx.state);

    const appliedLimit = sanitizeCommentsLimit(ctx.query);
    ctx.state.commentsLimit = appliedLimit;

    syncQueryContext(ctx);

    await next();
  };
};
