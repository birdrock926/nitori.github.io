import React from 'react';
import { Field, Flex, Typography, TextInput, Button, Box } from '@strapi/design-system';
import getTrad from '../../utils/getTrad';

const DEFAULT_MIN = 0.7;
const DEFAULT_MAX = 1.8;
const DEFAULT_STEP = 0.05;
const DEFAULT_SCALE = 1;

const toNullableNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const clampScale = (value, min, max) => {
  const numeric = toNullableNumber(value);
  if (numeric === null) {
    return null;
  }
  const clamped = Math.min(max, Math.max(min, numeric));
  return Math.round(clamped * 100) / 100;
};

const isPlainObject = (candidate) => {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(candidate);
  return prototype === Object.prototype || prototype === null;
};

const OPTION_PATHS = {
  min: ['min', 'options.min', 'config.min', 'settings.min'],
  max: ['max', 'options.max', 'config.max', 'settings.max'],
  step: ['step', 'options.step', 'config.step', 'settings.step'],
  defaultScale: [
    'defaultScale',
    'options.defaultScale',
    'config.defaultScale',
    'settings.defaultScale',
    'default',
    'defaultScaleOption',
  ],
};

const OPTION_ENTRY_ALIASES = {
  min: ['min', 'options.min'],
  max: ['max', 'options.max'],
  step: ['step', 'options.step'],
  defaultScale: ['defaultScale', 'options.defaultScale', 'default'],
};

const getByPath = (source, path) => {
  if (!isPlainObject(source)) {
    return undefined;
  }

  const segments = path.split('.');
  let cursor = source;

  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object') {
      return undefined;
    }

    cursor = cursor[segment];
  }

  return cursor;
};

const collectOptionCandidates = (root) => {
  const results = [];
  const queue = [];
  const seen = new WeakSet();

  const enqueue = (value) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        enqueue(entry);
      }
      return;
    }

    if (!isPlainObject(value)) {
      return;
    }

    if (seen.has(value)) {
      return;
    }

    seen.add(value);
    queue.push(value);
  };

  enqueue(root);

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) {
      continue;
    }

    results.push(candidate);

    enqueue(candidate.options);
    enqueue(candidate.settings);
    enqueue(candidate.config);
    enqueue(candidate.configuration);
    enqueue(candidate.values);
    enqueue(candidate.fields);
    enqueue(candidate.base);
    enqueue(candidate.choices);
    enqueue(candidate.defaults);
    enqueue(candidate.properties);
  }

  return results;
};

const extractNumericFromCandidate = (candidate, key) => {
  if (!candidate) {
    return undefined;
  }

  const candidates = collectOptionCandidates(candidate);
  const lookupPaths = OPTION_PATHS[key] ?? [];
  const aliasNames = OPTION_ENTRY_ALIASES[key] ?? [];

  for (const source of candidates) {
    for (const path of lookupPaths) {
      const direct = getByPath(source, path);
      const numeric = toNullableNumber(direct);
      if (numeric !== null) {
        return numeric;
      }
    }

    if (typeof source[key] !== 'undefined') {
      const numeric = toNullableNumber(source[key]);
      if (numeric !== null) {
        return numeric;
      }
    }

    if (typeof source.name === 'string') {
      const normalized = source.name.trim();
      for (const alias of aliasNames) {
        if (normalized === alias || normalized === `options.${alias}`) {
          const valueCandidates = [source.value, source.defaultValue, source.default, source.initialValue];
          for (const candidateValue of valueCandidates) {
            const numeric = toNullableNumber(candidateValue);
            if (numeric !== null) {
              return numeric;
            }
          }
        }
      }
    }
  }

  return undefined;
};

const resolveScaleConfig = (props) => {
  const rawProps = props ?? {};
  const { attribute, attributeOptions, options: directOptions } = rawProps;

  const optionSources = [
    attributeOptions,
    attribute?.options,
    directOptions,
    attributeOptions?.options,
    directOptions?.options,
  ];

  const min = optionSources.reduce((acc, candidate) => {
    if (Number.isFinite(acc)) {
      return acc;
    }
    return extractNumericFromCandidate(candidate, 'min');
  }, undefined);

  const max = optionSources.reduce((acc, candidate) => {
    if (Number.isFinite(acc)) {
      return acc;
    }
    return extractNumericFromCandidate(candidate, 'max');
  }, undefined);

  const step = optionSources.reduce((acc, candidate) => {
    if (Number.isFinite(acc)) {
      return acc;
    }
    return extractNumericFromCandidate(candidate, 'step');
  }, undefined);

  const defaultScale = optionSources.reduce((acc, candidate) => {
    if (Number.isFinite(acc)) {
      return acc;
    }
    return extractNumericFromCandidate(candidate, 'defaultScale');
  }, undefined);

  const resolvedMin = Number.isFinite(min) ? min : DEFAULT_MIN;
  const resolvedMax = Number.isFinite(max) ? max : DEFAULT_MAX;
  const resolvedStep = Number.isFinite(step) && step > 0 ? step : DEFAULT_STEP;
  const resolvedDefault = clampScale(defaultScale, resolvedMin, resolvedMax) ?? DEFAULT_SCALE;

  return {
    min: resolvedMin,
    max: resolvedMax,
    step: resolvedStep,
    defaultScale: resolvedDefault,
  };
};

const fallbackFormatMessage = (descriptor, values = {}) => {
  if (descriptor && typeof descriptor === 'object') {
    const template =
      typeof descriptor.defaultMessage === 'string'
        ? descriptor.defaultMessage
        : typeof descriptor.id === 'string'
        ? descriptor.id
        : '';

    if (!template) {
      return '';
    }

    return template.replace(/\{([^}]+)\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        const replacement = values[key];
        return replacement === undefined || replacement === null ? '' : String(replacement);
      }

      return match;
    });
  }

  if (typeof descriptor === 'string') {
    return descriptor;
  }

  return '';
};

const resolveFormatMessage = () => {
  const globalObject = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : {};
  const strapi = globalObject?.strapi;

  const candidates = [
    strapi?.i18n,
    strapi?.admin?.services?.intl,
    typeof strapi?.getPlugin === 'function' ? strapi.getPlugin('i18n')?.services?.i18n : null,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate.formatMessage === 'function') {
      return candidate.formatMessage.bind(candidate);
    }
  }

  return null;
};

class TypographyScaleInput extends React.PureComponent {
  constructor(props) {
    super(props);

    this.cachedResolvedFormat = null;
    this.cachedFormatMessage = null;
    this.warnedMissingIntl = false;
    this.cachedConfig = null;
    this.cachedConfigSources = {
      attribute: null,
      attributeOptions: null,
      options: null,
    };
  }

  getFormatMessage() {
    const resolved = resolveFormatMessage();

    if (resolved) {
      if (this.cachedResolvedFormat !== resolved) {
        this.cachedResolvedFormat = resolved;
        this.cachedFormatMessage = (descriptor, values) => {
          try {
            return resolved(descriptor, values);
          } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                '[typography-scale] Failed to format message via Strapi intl; using default message instead.',
                error
              );
            }
            return fallbackFormatMessage(descriptor, values);
          }
        };
      }

      return this.cachedFormatMessage;
    }

    if (!this.warnedMissingIntl && process.env.NODE_ENV !== 'production') {
      console.warn('[typography-scale] Intl context unavailable; using default messages.');
      this.warnedMissingIntl = true;
    }

    return fallbackFormatMessage;
  }

  getScaleConfig(rawProps = this.props ?? {}) {
    const attribute = rawProps.attribute;
    const attributeOptions = rawProps.attributeOptions;
    const options = rawProps.options;

    const hasCache =
      this.cachedConfig &&
      this.cachedConfigSources.attribute === attribute &&
      this.cachedConfigSources.attributeOptions === attributeOptions &&
      this.cachedConfigSources.options === options;

    if (hasCache) {
      return this.cachedConfig;
    }

    const computed = resolveScaleConfig(rawProps);
    this.cachedConfig = computed;
    this.cachedConfigSources = { attribute, attributeOptions, options };
    return computed;
  }

  emitChange(next) {
    const { name = 'typography-scale' } = this.props ?? {};
    const onChange = typeof this.props?.onChange === 'function' ? this.props.onChange : () => {};

    if (next === null) {
      onChange({ target: { name, value: null, type: 'float' } });
    } else {
      onChange({ target: { name, value: next, type: 'float' } });
    }
  }

  handleSliderChange = (event) => {
    const config = this.getScaleConfig();
    const target = event?.currentTarget ?? event?.target;
    const nextValue = clampScale(target?.value, config.min, config.max) ?? config.defaultScale;

    this.emitChange(nextValue);
  };

  handleNumberChange = (event) => {
    const config = this.getScaleConfig();
    const target = event?.currentTarget ?? event?.target;
    const raw = target?.value;

    if (raw === '' || raw === null || raw === undefined) {
      this.emitChange(null);
      return;
    }

    const nextValue = clampScale(raw, config.min, config.max) ?? config.defaultScale;
    this.emitChange(nextValue);
  };

  handleReset = () => {
    this.emitChange(null);
  };

  render() {
    const rawProps = this.props ?? {};
    const {
      attribute,
      attributeOptions,
      description,
      disabled = false,
      error,
      intlLabel,
      labelAction,
      name = 'typography-scale',
      required = false,
      value,
    } = rawProps;

    const config = this.getScaleConfig(rawProps);
    const rawValue = toNullableNumber(value);
    const numericValue = clampScale(rawValue, config.min, config.max);
    const sliderValue = numericValue ?? config.defaultScale;
    const numberValue = rawValue === null ? '' : (numericValue ?? config.defaultScale).toString();
    const formatMessage = this.getFormatMessage();
    const resolvedLabel = intlLabel ?? { id: getTrad('field.label'), defaultMessage: '文字サイズ倍率' };
    const hint = description ?? attribute?.description ?? attributeOptions?.description ?? null;
    const isDefault = rawValue === null;

    return (
      <Field.Root id={name} name={name} hint={hint} error={error} required={required}>
        <Flex direction="column" gap={3}>
          <Flex justifyContent="space-between" alignItems="center" gap={2}>
            <Field.Label action={labelAction}>{formatMessage(resolvedLabel)}</Field.Label>
            <Button variant="tertiary" size="S" onClick={this.handleReset} disabled={disabled} type="button">
              {formatMessage({ id: getTrad('field.reset'), defaultMessage: '既定値に戻す' })}
            </Button>
          </Flex>
          <Typography variant="pi" textColor="neutral600">
            {isDefault
              ? formatMessage(
                  { id: getTrad('field.usingDefault'), defaultMessage: '記事既定の文字サイズ（{value}倍）を使用しています。' },
                  { value: sliderValue.toFixed(2) }
                )
              : formatMessage(
                  { id: getTrad('field.preview'), defaultMessage: '現在の倍率: {value}倍' },
                  { value: sliderValue.toFixed(2) }
                )}
          </Typography>
          <Box paddingTop={1}>
            <input
              type="range"
              min={config.min}
              max={config.max}
              step={config.step}
              value={sliderValue}
              onChange={this.handleSliderChange}
              disabled={disabled}
              style={{ width: '100%', accentColor: 'var(--colors-primary500, #4945ff)' }}
              aria-label={formatMessage({ id: getTrad('field.slider'), defaultMessage: '文字サイズ倍率スライダー' })}
            />
          </Box>
          <Flex alignItems="flex-end" gap={2}>
            <TextInput
              id={`${name}-number`}
              type="number"
              label={formatMessage({ id: getTrad('field.inputLabel'), defaultMessage: '倍率' })}
              name={`${name}-number`}
              value={numberValue}
              onChange={this.handleNumberChange}
              step={config.step}
              min={config.min}
              max={config.max}
              required={false}
              disabled={disabled}
            />
            <Typography variant="pi" textColor="neutral600">
              ×
            </Typography>
          </Flex>
          <Field.Hint />
          <Field.Error />
        </Flex>
      </Field.Root>
    );
  }
}

export default (props) => React.createElement(TypographyScaleInput, props);
