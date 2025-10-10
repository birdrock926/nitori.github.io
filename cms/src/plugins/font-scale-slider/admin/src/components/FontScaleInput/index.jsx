import React from 'react';
import { Field, Flex, Typography, TextInput, Button, Box } from '@strapi/design-system';

const DEFAULT_MIN = 0.7;
const DEFAULT_MAX = 1.8;
const DEFAULT_STEP = 0.05;
const DEFAULT_SCALE = 1;
const MAX_PRECISION = 4;

const toNumeric = (value) => {
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

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const resolvePrecision = (step) => {
  if (!step || !Number.isFinite(step)) {
    return 2;
  }
  const parts = `${step}`.split('.');
  if (parts.length < 2) {
    return 2;
  }
  return Math.min(parts[1].length, MAX_PRECISION);
};

const roundToPrecision = (value, precision) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const clampedPrecision = Math.max(0, Math.min(MAX_PRECISION, precision));
  const factor = 10 ** clampedPrecision;
  return Math.round(value * factor) / factor;
};

const resolveOptions = (attribute) => {
  const options = attribute && typeof attribute === 'object' ? attribute.options ?? {} : {};

  const min = (() => {
    const parsed = toNumeric(options.min);
    return parsed !== null ? parsed : DEFAULT_MIN;
  })();

  const max = (() => {
    const parsed = toNumeric(options.max);
    if (parsed !== null && parsed > min) {
      return parsed;
    }
    return Math.max(DEFAULT_MAX, min + DEFAULT_STEP);
  })();

  const step = (() => {
    const parsed = toNumeric(options.step);
    if (parsed !== null && parsed > 0) {
      return parsed;
    }
    return DEFAULT_STEP;
  })();

  const precision = resolvePrecision(step);

  const defaultScale = (() => {
    const candidate =
      toNumeric(options.defaultScale) ??
      toNumeric(options.default) ??
      toNumeric(attribute?.default) ??
      DEFAULT_SCALE;
    return roundToPrecision(clamp(candidate, min, max), precision);
  })();

  return { min, max, step, defaultScale, precision };
};

const normalizeValue = (value, options) => {
  const parsed = toNumeric(value);
  if (parsed === null) {
    return null;
  }

  return roundToPrecision(clamp(parsed, options.min, options.max), options.precision);
};

const formatMessage = (message, fallback, values) => {
  const intl =
    typeof window !== 'undefined' && window.strapi && window.strapi.i18n
      ? window.strapi.i18n
      : null;

  if (intl && typeof intl.formatMessage === 'function') {
    try {
      return intl.formatMessage(message, values);
    } catch (error) {
      console.warn('[font-scale-slider] failed to format message', { message, error });
    }
  }

  const base = message && typeof message.defaultMessage === 'string' ? message.defaultMessage : fallback;
  if (!base) {
    return '';
  }

  if (!values) {
    return base;
  }

  return Object.entries(values).reduce(
    (text, [key, val]) => text.replace(new RegExp(`{${key}}`, 'g'), String(val)),
    base,
  );
};

class FontScaleInput extends React.PureComponent {
  constructor(props) {
    super(props);
    this.currentOptions = resolveOptions(props.attribute);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.attribute !== this.props.attribute) {
      this.currentOptions = resolveOptions(this.props.attribute);
    }
  }

  currentOptions;

  emitChange(next) {
    const { name, onChange } = this.props;
    if (typeof onChange !== 'function') {
      return;
    }

    if (next === null) {
      onChange({ target: { name, value: null, type: 'float' } });
      return;
    }

    onChange({ target: { name, value: next, type: 'float' } });
  }

  handleSliderChange = (event) => {
    const options = this.currentOptions ?? resolveOptions(this.props.attribute);
    const rawValue = event?.target?.value;
    const normalized = normalizeValue(rawValue, options);
    const safeValue = normalized === null ? options.defaultScale : normalized;
    this.emitChange(safeValue);
  };

  handleNumberChange = (event) => {
    const options = this.currentOptions ?? resolveOptions(this.props.attribute);
    const rawValue = event?.target?.value;
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      this.emitChange(null);
      return;
    }

    const normalized = normalizeValue(rawValue, options);
    const safeValue = normalized === null ? options.defaultScale : normalized;
    this.emitChange(safeValue);
  };

  handleReset = () => {
    this.emitChange(null);
  };

  render() {
    const { attribute, description, disabled, error, intlLabel, labelAction, name, required, value } =
      this.props;

    const options = resolveOptions(attribute);
    this.currentOptions = options;

    const normalizedValue = normalizeValue(value, options);
    const isUsingDefault = normalizedValue === null;
    const displayValue = isUsingDefault ? options.defaultScale : normalizedValue;
    const displayText = displayValue.toFixed(options.precision);

    const labelText = formatMessage(intlLabel, '文字サイズ倍率');
    const hintMessage = description ?? attribute?.description ?? undefined;

    const statusMessage = isUsingDefault
      ? formatMessage(
          { id: 'font-scale-slider.field.usingDefault', defaultMessage: '記事既定の文字サイズ（{value}倍）を使用しています。' },
          `記事既定の文字サイズ（${displayText}倍）を使用しています。`,
          { value: displayText },
        )
      : formatMessage(
          { id: 'font-scale-slider.field.preview', defaultMessage: '現在の倍率: {value}倍' },
          `現在の倍率: ${displayText}倍`,
          { value: displayText },
        );

    const sliderLabel = formatMessage(
      { id: 'font-scale-slider.field.slider', defaultMessage: '文字サイズ倍率スライダー' },
      '文字サイズ倍率スライダー',
    );

    return (
      <Field.Root id={name} name={name} required={required} error={error} hint={hintMessage} disabled={disabled}>
        <Flex direction="column" gap={3} alignItems="stretch">
          <Flex justifyContent="space-between" alignItems="center" gap={2}>
            <Field.Label action={labelAction}>{labelText}</Field.Label>
            <Button variant="tertiary" size="S" onClick={this.handleReset} disabled={disabled}>
              {formatMessage(
                { id: 'font-scale-slider.field.reset', defaultMessage: '既定値に戻す' },
                '既定値に戻す',
              )}
            </Button>
          </Flex>
          <Typography variant="pi" textColor="neutral600">
            {statusMessage}
          </Typography>
          <Box paddingTop={1}>
            <input
              type="range"
              min={options.min}
              max={options.max}
              step={options.step}
              value={displayValue}
              onChange={this.handleSliderChange}
              disabled={disabled}
              style={{ width: '100%', accentColor: 'var(--colors-primary500, #4945ff)' }}
              aria-label={sliderLabel}
            />
          </Box>
          <Flex alignItems="flex-end" gap={2}>
            <TextInput
              id={`${name}-number`}
              type="number"
              label={formatMessage(
                { id: 'font-scale-slider.field.inputLabel', defaultMessage: '倍率' },
                '倍率',
              )}
              name={`${name}-number`}
              value={displayText}
              onChange={this.handleNumberChange}
              step={options.step}
              min={options.min}
              max={options.max}
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

export default FontScaleInput;
