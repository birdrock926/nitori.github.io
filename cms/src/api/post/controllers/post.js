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

    const populate = ctx.query?.populate ?? {
      cover: true,
      tags: true,
      blocks: {
        populate: '*',
      },
    };

    ctx.query = {
      ...ctx.query,
      filters,
      populate,
    };

    const response = await super.find(ctx);
    return response;
  },
}));
