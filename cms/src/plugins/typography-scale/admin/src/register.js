import pluginId from './pluginId';
import TypographyScaleInput from './components/TypographyScaleInput/index.jsx';
import getTrad from './utils/getTrad';

const globalObject =
  typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : {};

const FIELD_REGISTER_SYMBOL = Symbol.for('plugin::typography-scale.field-registered');

const register = (app) => {
  if (globalObject[FIELD_REGISTER_SYMBOL]) {
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

  globalObject[FIELD_REGISTER_SYMBOL] = true;
};

export default register;
