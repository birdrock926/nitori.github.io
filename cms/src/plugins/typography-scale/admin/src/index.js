import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import register from './register';
import bootstrap from './bootstrap';
import prefixPluginTranslations from './utils/prefixPluginTranslations';

const globalObject =
  typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : {};

const PLUGIN_REGISTER_SYMBOL = Symbol.for('plugin::typography-scale.admin-registered');

const name = pluginPkg.strapi?.name || pluginPkg.name;

const admin = {
  register(app) {
    register(app);

    if (!globalObject[PLUGIN_REGISTER_SYMBOL]) {
      app.registerPlugin({
        id: pluginId,
        name,
      });

      globalObject[PLUGIN_REGISTER_SYMBOL] = true;
    }
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
