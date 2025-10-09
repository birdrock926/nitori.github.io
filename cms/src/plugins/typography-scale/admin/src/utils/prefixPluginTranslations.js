const prefixPluginTranslations = (data, pluginId) => {
  if (!data || typeof data !== 'object') {
    return {};
  }

  return Object.entries(data).reduce((acc, [key, value]) => {
    if (typeof key !== 'string') {
      return acc;
    }

    const normalizedKey = key.startsWith(`${pluginId}.`) ? key : `${pluginId}.${key}`;
    acc[normalizedKey] = value;
    return acc;
  }, {});
};

export default prefixPluginTranslations;
