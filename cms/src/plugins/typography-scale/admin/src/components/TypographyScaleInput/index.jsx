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
const ENTRY_IDENTIFIER_FIELDS = ['name', 'path', 'key', 'field', 'identifier', 'attribute'];
const ARRAY_CANDIDATE_KEYS = ['entries', 'base', 'advanced', 'choices', 'settings', 'configuration', 'options'];
const MAX_ARRAY_SCAN = 24;

const getValueByPath = (object, path) => {
  if (!isPlainObject(object)) {
    return undefined;
  }

  if (typeof path === 'string') {
    path = path.split('.');
  }

  if (!Array.isArray(path) || path.length === 0) {
    return undefined;
  }

  let current = object;
  for (const part of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    current = current[part];
  }

  return current;
};

const extractFromEntryArray = (entries, key) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const aliases = OPTION_ALIAS_MAP[key] ?? [key];
  const scanLimit = Math.min(entries.length, MAX_ARRAY_SCAN);

  for (let index = 0; index < scanLimit; index += 1) {
    const entry = entries[index];
    if (!isPlainObject(entry)) {
      continue;
    }

    const identifiers = ENTRY_IDENTIFIER_FIELDS
      .map((field) => entry[field])
      .filter((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);

    const matchesAlias = identifiers.some((identifier) => {
      return aliases.some((alias) => {
        if (alias === identifier) {
          return true;
        }

        if (alias.startsWith('options.') && identifier === alias.replace(/^options\./, '')) {
          return true;
        }

        return false;
      });
    });

    if (!matchesAlias) {
      continue;
    }

    for (const field of OPTION_VALUE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(entry, field)) {
        const numeric = toNullableNumber(entry[field]);
        if (numeric !== null) {
          return numeric;
        }
      }
    }
  }

  return null;
};

const extractFromObject = (object, key) => {
  if (!isPlainObject(object)) {
    return null;
  }

  const aliases = OPTION_ALIAS_MAP[key] ?? [key];

  for (const alias of aliases) {
    const numeric = toNullableNumber(getValueByPath(object, alias));
    if (numeric !== null) {
      return numeric;
    }
  }

  if (Object.prototype.hasOwnProperty.call(object, key)) {
    const numeric = toNullableNumber(object[key]);
    if (numeric !== null) {
      return numeric;
    }
  }

  if (Object.prototype.hasOwnProperty.call(object, 'options') && isPlainObject(object.options) && object.options !== object) {
    const numeric = extractFromObject(object.options, key);
    if (numeric !== null) {
      return numeric;
    }
  }

  for (const candidateKey of ARRAY_CANDIDATE_KEYS) {
    const candidate = object[candidateKey];
    if (Array.isArray(candidate)) {
      const numeric = extractFromEntryArray(candidate, key);
      if (numeric !== null) {
        return numeric;
      }
    }
  }

  return null;
};

const collectOptionSources = (rawProps) => {
  const sources = [];

  if (isPlainObject(rawProps)) {
    sources.push(rawProps);
  }

  if (isPlainObject(rawProps?.options)) {
    sources.push(rawProps.options);
  }

  if (isPlainObject(rawProps?.attributeOptions?.options)) {
    sources.push(rawProps.attributeOptions.options);
  }

  if (isPlainObject(rawProps?.attributeOptions)) {
    sources.push(rawProps.attributeOptions);
  }

  if (isPlainObject(rawProps?.attribute?.options)) {
    sources.push(rawProps.attribute.options);
  }

  if (isPlainObject(rawProps?.attribute)) {
    sources.push(rawProps.attribute);
  }

  return sources;
};

const resolveScaleConfig = (props) => {
  const rawProps = props ?? {};
  const sources = collectOptionSources(rawProps);

  const resolved = { min: null, max: null, step: null, defaultScale: null };

  for (const key of Object.keys(resolved)) {
    for (const source of sources) {
      const numeric = extractFromObject(source, key);
      if (numeric !== null) {
        resolved[key] = numeric;
        break;
      }
    }
  }

  const min = Number.isFinite(resolved.min) ? resolved.min : DEFAULT_MIN;
  const max = Number.isFinite(resolved.max) ? resolved.max : DEFAULT_MAX;
  const step = Number.isFinite(resolved.step) && resolved.step > 0 ? resolved.step : DEFAULT_STEP;
  const defaultScale = clampScale(resolved.defaultScale, min, max) ?? DEFAULT_SCALE;

  return { min, max, step, defaultScale };
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
