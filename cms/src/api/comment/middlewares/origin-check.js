export default (config, { strapi }) => {
  const allowedOrigins = config?.origins || process.env.PUBLIC_FRONT_ORIGINS?.split(',') || [];
  return async (ctx, next) => {
    const origin = ctx.request.header.origin;
    if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) {
      ctx.set('Vary', 'Origin');
      ctx.throw(403, 'Origin not allowed');
    }
    await next();
  };
};
