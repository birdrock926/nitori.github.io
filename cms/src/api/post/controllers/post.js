import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::post.post', () => ({
  async find(ctx) {
    const filters = {
      ...(ctx.query?.filters || {}),
      publishedAt: {
        ...(ctx.query?.filters?.publishedAt || {}),
        $notNull: true,
      },
    };

    const defaultPopulate = {
      cover: {
        populate: '*',
      },
      tags: true,
      blocks: {
        populate: '*',
      },
    };

    const incomingPopulate = ctx.query?.populate;
    const populate =
      !incomingPopulate || incomingPopulate === 'deep' || incomingPopulate === '*'
        ? defaultPopulate
        : incomingPopulate;

    ctx.query = {
      ...ctx.query,
      filters,
      populate,
    };

    const response = await super.find(ctx);
    return response;
  },
}));
