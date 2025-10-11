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

      const seenLinks = new Set();

      const nextSections = menu.sections.map((section) => {
        if (!section || !Array.isArray(section.links)) {
          return section;
        }

        const links = [];

        section.links.forEach((link) => {
          if (!link) {
            return;
          }

          if (link.to === '/marketplace') {
            return;
          }

          let nextLink = link;

          if (link.to === '/plugins/content-type-builder') {
            nextLink = {
              ...link,
              icon: PuzzlePiece,
              intlLabel: {
                id: 'game-news.content-builder',
                defaultMessage: 'コンテンツ設計',
              },
            };
          }

          const key = nextLink.to || nextLink.uid || nextLink.id;
          if (key && seenLinks.has(key)) {
            return;
          }

          if (key) {
            seenLinks.add(key);
          }

          links.push(nextLink);
        });

        return { ...section, links };
      });

      return { ...menu, sections: nextSections };
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
