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
  ],
};
