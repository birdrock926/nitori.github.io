export default {
  routes: [
    {
      method: 'POST',
      path: '/comments/submit',
      handler: 'comment.submit',
      config: {
        auth: false,
        policies: [],
        middlewares: ['api::comment.origin-check'],
      },
    },
    {
      method: 'GET',
      path: '/comments/list',
      handler: 'comment.list',
      config: {
        auth: false,
        policies: [],
        middlewares: ['api::comment.origin-check'],
      },
    },
    {
      method: 'POST',
      path: '/comments/:id/report',
      handler: 'comment.report',
      config: {
        auth: false,
        policies: [],
        middlewares: ['api::comment.origin-check'],
      },
    },
    {
      method: 'POST',
      path: '/comments/:id/delete',
      handler: 'comment.deleteOwn',
      config: {
        auth: false,
        policies: [],
        middlewares: ['api::comment.origin-check'],
      },
    },
    {
      method: 'POST',
      path: '/mod/comments/:id/publish',
      handler: 'comment.publish',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
      },
    },
    {
      method: 'POST',
      path: '/mod/comments/:id/hide',
      handler: 'comment.hide',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
      },
    },
    {
      method: 'POST',
      path: '/mod/comments/:id/shadow',
      handler: 'comment.shadow',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
      },
    },
  ],
};
