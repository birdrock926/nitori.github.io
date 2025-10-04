import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::post.post', {
  config: {
    find: {
      auth: false,
      policies: [],
    },
    findOne: {
      auth: false,
      policies: [],
    },
  },
});
