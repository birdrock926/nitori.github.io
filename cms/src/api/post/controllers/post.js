import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::post.post', ({ strapi }) => ({
  async find(ctx) {
    const query = {
      ...ctx.query,
      filters: {
        ...(ctx.query?.filters || {}),
        publishedAt: { $notNull: true },
      },
      populate: {
        cover: true,
        tags: true,
        blocks: {
          populate: '*',
        },
      },
    };

    const data = await strapi.entityService.findPage('api::post.post', query);
    return data;
  },
}));
