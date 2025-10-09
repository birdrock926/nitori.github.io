import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import register from './register';
import bootstrap from './bootstrap';
import { prefixPluginTranslations } from '@strapi/helper-plugin';

const name = pluginPkg.strapi?.name || pluginPkg.name;

const admin = {
  register(app) {
    register(app);
    app.registerPlugin({
      id: pluginId,
      name,
    });
  },
  bootstrap(app) {
    bootstrap(app);
  },
  async registerTrads({ locales }) {
    const translations = await Promise.all(
      locales.map(async (locale) => {
        const data = await import(`./translations/${locale}.json`).then((module) => module.default || module).catch(() => ({}));
        return {
          data: prefixPluginTranslations(data, pluginId),
          locale,
        };
      })
    );

    return translations;
  },
};

export default admin;
