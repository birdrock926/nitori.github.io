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

      const seenKeys = new Set();

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

          const candidateKeys = [nextLink.uid, nextLink.to, nextLink.id]
            .map((value) => (typeof value === 'string' ? value.trim() : value))
            .filter((value) => typeof value === 'string' && value.length > 0);

          if (candidateKeys.some((key) => seenKeys.has(key))) {
            return;
          }

          if (candidateKeys.length === 0) {
            candidateKeys.push(`link-${links.length}`);
          }

          candidateKeys.forEach((key) => seenKeys.add(key));

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
