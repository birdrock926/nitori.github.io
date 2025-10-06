export default {
  config: {
    locales: ['ja'],
    tutorials: false,
    notifications: { release: false },
    translations: {
      ja: {
        'Auth.form.email.label': 'メールアドレス',
      },
    },
  },
  bootstrap(app) {
    app.addMenuLink({
      to: '/plugins/content-type-builder',
      icon: 'Layer',
      intlLabel: {
        id: 'game-news.content-builder',
        defaultMessage: 'コンテンツ設計',
      },
    });
  },
};
