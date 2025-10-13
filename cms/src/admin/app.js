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
    if (typeof app?.registerHook !== 'function') {
      return;
    }

    try {
      app.registerHook('admin.menu.main', (menuItems = []) => {
        const seen = new Set();

        return menuItems
          .map((item) => {
            if (item?.to === '/plugins/content-type-builder') {
              return {
                ...item,
                intlLabel: {
                  id: 'game-news.content-builder',
                  defaultMessage: 'コンテンツ設計',
                },
              };
            }
            return item;
          })
          .filter((item) => {
            if (!item) {
              return false;
            }

            const key =
              item.id ||
              item.uid ||
              item.to ||
              (typeof item?.intlLabel?.id === 'string' ? item.intlLabel.id : null);

            if (!key) {
              return true;
            }

            if (seen.has(key)) {
              return false;
            }

            seen.add(key);
            return true;
          });
      });
    } catch (error) {
      console.warn('[admin] Failed to register admin.menu.main hook', error);
    }
  },
};
