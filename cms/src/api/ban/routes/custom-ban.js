export default {
  routes: [
    {
      method: 'POST',
      path: '/mod/ban',
      handler: 'ban.createBan',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
      },
    },
    {
      method: 'DELETE',
      path: '/mod/ban/:id',
      handler: 'ban.deleteBan',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
      },
    },
  ],
};
