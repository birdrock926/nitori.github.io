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

const OPTION_ALIAS_MAP = {
  min: ['min', 'options.min'],
  max: ['max', 'options.max'],
  step: ['step', 'options.step'],
  defaultScale: ['defaultScale', 'options.defaultScale', 'default', 'defaultScaleOption'],
};

const OPTION_VALUE_FIELDS = ['value', 'defaultValue', 'initialValue', 'current', 'default'];

const OBJECT_SOURCE_PATHS = [
  [],
  ['attributeOptions'],
  ['attributeOptions', 'options'],
  ['attributeOptions', 'settings'],
  ['attributeOptions', 'config'],
  ['attributeOptions', 'configuration'],
  ['attribute'],
  ['attribute', 'options'],
  ['attribute', 'settings'],
  ['options'],
  ['options', 'options'],
  ['options', 'settings'],
  ['options', 'config'],
  ['options', 'configuration'],
];

const ARRAY_SOURCE_PATHS = [
  ['attributeOptions', 'base'],
  ['attributeOptions', 'advanced'],
  ['attributeOptions', 'choices'],
  ['attributeOptions', 'properties'],
  ['attributeOptions', 'defaults'],
  ['attributeOptions', 'config', 'base'],
  ['attributeOptions', 'config', 'advanced'],
  ['attributeOptions', 'configuration', 'base'],
  ['attributeOptions', 'configuration', 'advanced'],
  ['attribute', 'options', 'base'],
  ['attribute', 'options', 'advanced'],
  ['attribute', 'options', 'choices'],
  ['attribute', 'options', 'properties'],
  ['options', 'base'],
  ['options', 'advanced'],
  ['options', 'choices'],
  ['options', 'properties'],
  ['options', 'defaults'],
  ['options', 'config', 'base'],
  ['options', 'config', 'advanced'],
  ['options', 'configuration', 'base'],
  ['options', 'configuration', 'advanced'],
];

const getNestedValue = (root, path) => {
  if (!Array.isArray(path) || path.length === 0) {
    return root;
  }

  let current = root;
  for (const part of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    current = current[part];
  }

  return current;
};

const extractNumericFromEntry = (entry, key) => {
  if (!isPlainObject(entry)) {
    return null;
  }

  const aliases = OPTION_ALIAS_MAP[key] ?? [];
  const identifierCandidates = [entry.name, entry.path, entry.key, entry.field, entry.identifier, entry.attribute];

  const normalizedIdentifiers = identifierCandidates
    .filter((candidate) => typeof candidate === 'string')
    .map((candidate) => candidate.trim());

  const matchesAlias = normalizedIdentifiers.some((identifier) => {
    if (!identifier) {
      return false;
    }

    return aliases.some((alias) => alias === identifier || alias === identifier.replace(/^options\./, ''));
  });

  if (!matchesAlias) {
    return null;
  }

  for (const field of OPTION_VALUE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) {
      const numeric = toNullableNumber(entry[field]);
      if (numeric !== null) {
        return numeric;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(entry, 'value')) {
    const numeric = toNullableNumber(entry.value);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
};

const extractNumericFromObject = (object, key) => {
  if (!isPlainObject(object)) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(object, key)) {
    const numeric = toNullableNumber(object[key]);
    if (numeric !== null) {
      return numeric;
    }
  }

  if (Object.prototype.hasOwnProperty.call(object, 'options') && isPlainObject(object.options)) {
    const numeric = toNullableNumber(object.options[key]);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
};

const resolveScaleConfig = (props) => {
  const rawProps = props ?? {};

  const discovered = { min: undefined, max: undefined, step: undefined, defaultScale: undefined };

  for (const [key, pathList] of Object.entries({
    min: OBJECT_SOURCE_PATHS,
    max: OBJECT_SOURCE_PATHS,
    step: OBJECT_SOURCE_PATHS,
    defaultScale: OBJECT_SOURCE_PATHS,
  })) {
    for (const path of pathList) {
      const candidate = getNestedValue(rawProps, path);
      const numeric = extractNumericFromObject(candidate, key);
      if (numeric !== null) {
        discovered[key] = numeric;
        break;
      }
    }
  }

  for (const path of ARRAY_SOURCE_PATHS) {
    const entries = getNestedValue(rawProps, path);
    if (!Array.isArray(entries) || entries.length === 0) {
      continue;
    }

    for (const key of Object.keys(discovered)) {
      if (Number.isFinite(discovered[key])) {
        continue;
      }

      for (const entry of entries) {
        const numeric = extractNumericFromEntry(entry, key);
        if (numeric !== null) {
          discovered[key] = numeric;
          break;
        }
      }
    }
  }

  const resolvedMin = Number.isFinite(discovered.min) ? discovered.min : DEFAULT_MIN;
  const resolvedMax = Number.isFinite(discovered.max) ? discovered.max : DEFAULT_MAX;
  const resolvedStep = Number.isFinite(discovered.step) && discovered.step > 0 ? discovered.step : DEFAULT_STEP;
  const resolvedDefault = clampScale(discovered.defaultScale, resolvedMin, resolvedMax) ?? DEFAULT_SCALE;

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
