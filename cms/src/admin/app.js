import { PuzzlePiece } from '@strapi/icons';

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
    if (!app || typeof app.registerHook !== 'function') {
      return;
    }

    const customizeMenu = (menu) => {
      if (!menu || !Array.isArray(menu.sections)) {
        return menu;
      }

      const sections = menu.sections.map((section) => {
        if (!section || !Array.isArray(section.links)) {
          return section;
        }

        const links = section.links.map((link) => {
          if (link?.to === '/plugins/content-type-builder') {
            return {
              ...link,
              icon: PuzzlePiece,
              intlLabel: {
                id: 'game-news.content-builder',
                defaultMessage: 'コンテンツ設計',
              },
            };
          }

          return link;
        });

        return { ...section, links };
      });

      return { ...menu, sections };
    };

    const hookNames = ['admin.menu.main', 'admin.menu'];

    const isDevEnvironment = typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';

    for (const hookName of hookNames) {
      try {
        app.registerHook(hookName, customizeMenu);
        return;
      } catch (error) {
        if (isDevEnvironment) {
          console.warn(`Skipped unavailable Strapi admin hook "${hookName}"`, error);
        }
      }
    }
  },
};
