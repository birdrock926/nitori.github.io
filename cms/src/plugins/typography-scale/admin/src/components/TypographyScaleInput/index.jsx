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

const extractOptionObject = (candidate) => {
  if (!isPlainObject(candidate)) {
    return null;
  }

  const nested = isPlainObject(candidate.options) ? candidate.options : {};

  return { ...nested, ...candidate };
};

const mergeOptions = (...candidates) => {
  return candidates.reduce((acc, candidate) => {
    if (Array.isArray(candidate)) {
      return candidate.reduce((innerAcc, nestedCandidate) => {
        const extracted = extractOptionObject(nestedCandidate);
        if (!extracted) {
          return innerAcc;
        }

        return { ...innerAcc, ...extracted };
      }, acc);
    }

    const extracted = extractOptionObject(candidate);
    if (!extracted) {
      return acc;
    }

    return { ...acc, ...extracted };
  }, {});
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

const computeInternalValue = (pendingValue, config) => {
  const base = pendingValue ?? config.defaultScaleOption;
  return clampScale(base, config.min, config.max) ?? config.defaultScaleOption;
};

const resolveScaleConfig = (props) => {
  const rawProps = props ?? {};
  const { attribute, attributeOptions, options: directOptions } = rawProps;

  const options = mergeOptions(attribute?.options, attributeOptions, directOptions);
  const min = typeof options.min === 'number' ? options.min : DEFAULT_MIN;
  const max = typeof options.max === 'number' ? options.max : DEFAULT_MAX;
  const step = typeof options.step === 'number' && options.step > 0 ? options.step : DEFAULT_STEP;
  const defaultScaleOption =
    typeof options.defaultScale === 'number' ? clampScale(options.defaultScale, min, max) ?? DEFAULT_SCALE : DEFAULT_SCALE;

  return { options, min, max, step, defaultScaleOption };
};

const hasConfigChanged = (nextConfig, previousConfig) => {
  if (!previousConfig) {
    return true;
  }

  return (
    nextConfig.min !== previousConfig.min ||
    nextConfig.max !== previousConfig.max ||
    nextConfig.step !== previousConfig.step ||
    nextConfig.defaultScaleOption !== previousConfig.defaultScaleOption
  );
};

class TypographyScaleInputInner extends React.Component {
  constructor(props) {
    super(props);

    const initialConfig = resolveScaleConfig(props);
    const initialPending = toNullableNumber(props?.value);

    this.state = {
      config: initialConfig,
      pendingValue: initialPending,
      internal: computeInternalValue(initialPending, initialConfig),
      lastPropValue: initialPending,
    };

    this.cachedResolvedFormat = null;
    this.cachedFormatMessage = null;
    this.warnedMissingIntl = false;
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    const nextConfig = resolveScaleConfig(nextProps);
    const incomingValue = toNullableNumber(nextProps?.value);
    const configChanged = hasConfigChanged(nextConfig, prevState.config);
    const propChanged = !Object.is(incomingValue, prevState.lastPropValue);

    if (!configChanged && !propChanged) {
      return null;
    }

    let pendingValue = prevState.pendingValue;
    let internalValue = prevState.internal;

    if (propChanged) {
      pendingValue = incomingValue;
      internalValue = computeInternalValue(incomingValue, nextConfig);
    } else if (configChanged) {
      internalValue = computeInternalValue(pendingValue, nextConfig);
    }

    return {
      config: nextConfig,
      pendingValue,
      internal: internalValue,
      lastPropValue: incomingValue,
    };
  }

  getCurrentConfig() {
    return this.state?.config ?? resolveScaleConfig(this.props);
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
    const config = this.getCurrentConfig();
    const nextValue = clampScale(event.target.value, config.min, config.max) ?? config.defaultScaleOption;

    this.setState({ pendingValue: nextValue, internal: nextValue });
    this.emitChange(nextValue);
  };

  handleNumberChange = (event) => {
    const config = this.getCurrentConfig();
    const raw = event.target.value;

    if (raw === '' || raw === null || raw === undefined) {
      this.setState({ pendingValue: null, internal: config.defaultScaleOption });
      this.emitChange(null);
      return;
    }

    const nextValue = clampScale(raw, config.min, config.max) ?? config.defaultScaleOption;
    this.setState({ pendingValue: nextValue, internal: nextValue });
    this.emitChange(nextValue);
  };

  handleReset = () => {
    const config = this.getCurrentConfig();
    this.setState({ pendingValue: null, internal: config.defaultScaleOption });
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
    } = rawProps;

    const config = this.getCurrentConfig();

    const formatMessage = this.getFormatMessage();
    const resolvedLabel = intlLabel ?? { id: getTrad('field.label'), defaultMessage: '文字サイズ倍率' };
    const { pendingValue, internal } = this.state;
    const displayScale = clampScale(internal, config.min, config.max) ?? config.defaultScaleOption;
    const isDefault = pendingValue === null;
    const hint = description ?? attribute?.description ?? attributeOptions?.description ?? null;

    return (
      <Field.Root id={name} name={name} hint={hint} error={error} required={required}>
        <Flex direction="column" gap={3}>
          <Flex justifyContent="space-between" alignItems="center" gap={2}>
            <Field.Label action={labelAction}>{formatMessage(resolvedLabel)}</Field.Label>
            <Button variant="tertiary" size="S" onClick={this.handleReset} disabled={disabled}>
              {formatMessage({ id: getTrad('field.reset'), defaultMessage: '既定値に戻す' })}
            </Button>
          </Flex>
          <Typography variant="pi" textColor="neutral600">
            {isDefault
              ? formatMessage(
                  { id: getTrad('field.usingDefault'), defaultMessage: '記事既定の文字サイズ（{value}倍）を使用しています。' },
                  { value: displayScale.toFixed(2) }
                )
              : formatMessage(
                  { id: getTrad('field.preview'), defaultMessage: '現在の倍率: {value}倍' },
                  { value: displayScale.toFixed(2) }
                )}
          </Typography>
          <Box paddingTop={1}>
            <input
              type="range"
              min={config.min}
              max={config.max}
              step={config.step}
              value={displayScale}
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
              value={displayScale.toString()}
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

const TypographyScaleInput = (props) => React.createElement(TypographyScaleInputInner, props);

export default TypographyScaleInput;
