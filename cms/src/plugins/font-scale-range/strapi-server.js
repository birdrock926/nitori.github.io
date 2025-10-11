const pluginId = 'font-scale-range';

const plugin = {
  register({ strapi }) {
    if (!strapi?.customFields?.register) {
      return;
    }

    try {
      strapi.customFields.register({
        name: 'scale',
        plugin: pluginId,
        type: 'decimal',
      });
    } catch (error) {
      const alreadyRegistered =
        typeof error?.message === 'string' && error.message.includes('already been registered');

      if (!alreadyRegistered) {
        strapi.log?.error?.('[font-scale-range] failed to register custom field', error);
      }
    }
  },
};

export default plugin;
