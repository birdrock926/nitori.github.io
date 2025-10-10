import pluginId from './pluginId';
import TypographyScaleInput from './components/TypographyScaleInput/index.jsx';
import getTrad from './utils/getTrad';

const globalObject =
  typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : {};

const FIELD_REGISTER_KEY = '__plugin_typography_scale_field_registered__';

const hasRegisteredField = () =>
  Boolean(Object.prototype.hasOwnProperty.call(globalObject, FIELD_REGISTER_KEY) && globalObject[FIELD_REGISTER_KEY]);

const markFieldRegistered = () => {
  try {
    Object.defineProperty(globalObject, FIELD_REGISTER_KEY, {
      value: true,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch (error) {
    globalObject[FIELD_REGISTER_KEY] = true;
  }
};

const register = (app) => {
  if (hasRegisteredField()) {
    return;
  }

  app.customFields.register({
    name: 'scale',
    pluginId,
    type: 'float',
    intlLabel: {
      id: getTrad('field.label'),
      defaultMessage: '文字サイズ倍率',
    },
    intlDescription: {
      id: getTrad('field.description'),
      defaultMessage:
        'この記事ブロックの文字サイズを記事全体の標準値に対する倍率で調整します。空欄のままにすると記事既定のサイズが使われます。',
    },
    components: {
      Input: TypographyScaleInput,
    },
    options: {
      base: [
        {
          intlLabel: {
            id: getTrad('options.min'),
            defaultMessage: '最小倍率',
          },
          name: 'options.min',
          type: 'number',
          defaultValue: 0.7,
        },
        {
          intlLabel: {
            id: getTrad('options.max'),
            defaultMessage: '最大倍率',
          },
          name: 'options.max',
          type: 'number',
          defaultValue: 1.8,
        },
        {
          intlLabel: {
            id: getTrad('options.step'),
            defaultMessage: '刻み幅',
          },
          name: 'options.step',
          type: 'number',
          defaultValue: 0.05,
        },
        {
          intlLabel: {
            id: getTrad('options.defaultScale'),
            defaultMessage: 'プレビュー既定値',
          },
          name: 'options.defaultScale',
          type: 'number',
          defaultValue: 1,
        },
      ],
      advanced: [],
    },
  });

  markFieldRegistered();
};

export default register;
