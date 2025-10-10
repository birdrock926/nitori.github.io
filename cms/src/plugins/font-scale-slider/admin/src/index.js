import pluginId from './pluginId';
import register from './register';

const pluginName = 'Font scale slider';

export default {
  register(app) {
    register(app);

    if (typeof app.registerPlugin === 'function') {
      const existing = typeof app.getPlugin === 'function' ? app.getPlugin(pluginId) : null;
      if (!existing) {
        app.registerPlugin({
          id: pluginId,
          isReady: true,
          name: pluginName,
        });
      }
    }
  },
  bootstrap() {},
};
