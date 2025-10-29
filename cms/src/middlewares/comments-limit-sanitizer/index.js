import {
  sanitizeCommentsLimit,
  shouldSanitizeCommentsRequest,
  syncQueryContext,
} from '../../extensions/comments/utils/limit.js';

export default () => async (ctx, next) => {
  if (!shouldSanitizeCommentsRequest(ctx)) {
    return next();
  }

  if (!ctx.query || typeof ctx.query !== 'object') {
    ctx.query = {};
  }

  const appliedLimit = sanitizeCommentsLimit(ctx.query);

  if (!ctx.state || typeof ctx.state !== 'object') {
    ctx.state = {};
  }
  ctx.state.commentsLimit = appliedLimit;

  syncQueryContext(ctx);

  await next();
};
