import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import register from './register';
import bootstrap from './bootstrap';
import prefixPluginTranslations from './utils/prefixPluginTranslations';

const globalObject =
  typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : {};

const PLUGIN_REGISTER_KEY = '__plugin_typography_scale_admin_registered__';

const hasRegisteredPlugin = () =>
  Boolean(Object.prototype.hasOwnProperty.call(globalObject, PLUGIN_REGISTER_KEY) && globalObject[PLUGIN_REGISTER_KEY]);

const markPluginRegistered = () => {
  try {
    Object.defineProperty(globalObject, PLUGIN_REGISTER_KEY, {
      value: true,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch (error) {
    globalObject[PLUGIN_REGISTER_KEY] = true;
  }
};

const name = pluginPkg.strapi?.name || pluginPkg.name;

const admin = {
  register(app) {
    register(app);

    if (!hasRegisteredPlugin()) {
      app.registerPlugin({
        id: pluginId,
        name,
      });

      markPluginRegistered();
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
