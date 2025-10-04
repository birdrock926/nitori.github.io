import originCheck from '../api/comment/middlewares/origin-check.js';

export default () => {
  const checkOrigin = originCheck();

  return async (ctx, next) => {
    if (ctx.method === 'GET' && ctx.path === '/api/comments/list') {
      await checkOrigin(ctx, async () => {});

      const controller = strapi.controller('api::comment.comment');
      if (!controller?.list) {
        ctx.throw(500, 'コメントAPIが利用できません');
      }

      const result = await controller.list(ctx);
      if (result !== undefined) {
        ctx.body = result;
        strapi.log.debug('comment-proxy served list request');
      }
      return;
    }

    return next();
  };
};
