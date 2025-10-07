export default {
  routes: [
    {
      method: 'GET',
      path: '/posts/by-slug/:slug',
      handler: 'post.findBySlug',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/posts/slugs',
      handler: 'post.slugs',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};
