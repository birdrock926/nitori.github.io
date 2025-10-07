export default {
  routes: [
    {
      method: 'GET',
      path: '/ranking',
      handler: 'ranking.index',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};
