import pluginId from './pluginId';
import FontScaleInput from './components/FontScaleInput/index.jsx';

const FIELD_NAME = 'scale';

const hasRegisteredField = (app) => {
  if (!app || !app.customFields) {
    return false;
  }

  const getAll = typeof app.customFields.getAll === 'function' ? app.customFields.getAll : null;
  if (!getAll) {
    return false;
  }

  try {
    const existing = getAll();
    return Array.isArray(existing)
      ? existing.some((field) => field && field.pluginId === pluginId && field.name === FIELD_NAME)
      : false;
  } catch (error) {
    console.warn('[font-scale-slider] failed to inspect registered custom fields', error);
    return false;
  }
};

const registerField = (app) => {
  if (!app || !app.customFields || typeof app.customFields.register !== 'function') {
    return;
  }

  if (hasRegisteredField(app)) {
    return;
  }

  app.customFields.register({
    name: FIELD_NAME,
    pluginId,
    type: 'float',
    intlLabel: {
      id: `${pluginId}.field.label`,
      defaultMessage: '文字サイズ倍率',
    },
    intlDescription: {
      id: `${pluginId}.field.description`,
      defaultMessage:
        'Rich Text ブロックに適用するフォント倍率です。未入力の場合は記事全体の既定値が利用されます。',
    },
    components: {
      Input: FontScaleInput,
    },
    options: {
      base: [
        {
          intlLabel: {
            id: `${pluginId}.options.min`,
            defaultMessage: '最小倍率',
          },
          name: 'min',
          type: 'number',
          defaultValue: 0.7,
        },
        {
          intlLabel: {
            id: `${pluginId}.options.max`,
            defaultMessage: '最大倍率',
          },
          name: 'max',
          type: 'number',
          defaultValue: 1.8,
        },
        {
          intlLabel: {
            id: `${pluginId}.options.step`,
            defaultMessage: '刻み幅',
          },
          name: 'step',
          type: 'number',
          defaultValue: 0.05,
        },
        {
          intlLabel: {
            id: `${pluginId}.options.default`,
            defaultMessage: 'プレビュー既定値',
          },
          name: 'defaultScale',
          type: 'number',
          defaultValue: 1,
        },
      ],
      advanced: [],
    },
  });
};

const register = (app) => {
  try {
    registerField(app);
  } catch (error) {
    console.error('[font-scale-slider] failed to register custom field', error);
  }
};

export default register;
