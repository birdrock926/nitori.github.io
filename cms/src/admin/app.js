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
    app.registerHook('admin.menu.main', (menu) => {
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
    });
  },
};
