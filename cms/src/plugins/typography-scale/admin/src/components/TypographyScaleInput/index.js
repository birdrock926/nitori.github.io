import React from 'react';
import { useIntl } from 'react-intl';
import { Field, FieldLabel, FieldHint, FieldError } from '@strapi/design-system/Field';
import { Stack } from '@strapi/design-system/Stack';
import { Flex } from '@strapi/design-system/Flex';
import { Typography } from '@strapi/design-system/Typography';
import { TextInput } from '@strapi/design-system/TextInput';
import { Button } from '@strapi/design-system/Button';
import { Box } from '@strapi/design-system/Box';
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

const TypographyScaleInput = ({
  attribute,
  description,
  disabled,
  error,
  intlLabel,
  labelAction,
  name,
  onChange,
  required,
  value,
}) => {
  const { formatMessage } = useIntl();
  const options = attribute?.options ?? {};
  const min = typeof options.min === 'number' ? options.min : DEFAULT_MIN;
  const max = typeof options.max === 'number' ? options.max : DEFAULT_MAX;
  const step = typeof options.step === 'number' && options.step > 0 ? options.step : DEFAULT_STEP;
  const defaultScaleOption =
    typeof options.defaultScale === 'number' ? clampScale(options.defaultScale, min, max) : DEFAULT_SCALE;

  const [pendingValue, setPendingValue] = React.useState(() => toNullableNumber(value));
  const [internal, setInternal] = React.useState(() => {
    const initial = toNullableNumber(value);
    const base = initial ?? defaultScaleOption;
    return clampScale(base, min, max) ?? defaultScaleOption;
  });

  React.useEffect(() => {
    const nextPending = toNullableNumber(value);
    setPendingValue(nextPending);
    const base = nextPending ?? defaultScaleOption;
    setInternal(clampScale(base, min, max) ?? defaultScaleOption);
  }, [value, min, max, defaultScaleOption]);

  const emitChange = (next) => {
    setPendingValue(next);
    if (next === null) {
      onChange({ target: { name, value: null, type: 'float' } });
    } else {
      onChange({ target: { name, value: next, type: 'float' } });
    }
  };

  const handleSliderChange = (event) => {
    const nextValue = clampScale(event.target.value, min, max) ?? defaultScaleOption;
    setInternal(nextValue);
    emitChange(nextValue);
  };

  const handleNumberChange = (event) => {
    const raw = event.target.value;
    if (raw === '' || raw === null || raw === undefined) {
      setInternal(defaultScaleOption);
      emitChange(null);
      return;
    }
    const nextValue = clampScale(raw, min, max) ?? defaultScaleOption;
    setInternal(nextValue);
    emitChange(nextValue);
  };

  const handleReset = () => {
    setInternal(defaultScaleOption);
    emitChange(null);
  };

  const isDefault = pendingValue === null;
  const displayScale = clampScale(internal, min, max) ?? defaultScaleOption;
  const hint = description ?? attribute?.description ?? null;

  return (
    <Field id={name} name={name} hint={hint} error={error} required={required}>
      <Stack spacing={3}>
        <Flex justifyContent="space-between" alignItems="center" gap={2}>
          <FieldLabel action={labelAction}>{formatMessage(intlLabel)}</FieldLabel>
          <Button variant="tertiary" size="S" onClick={handleReset} disabled={disabled}>
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
            min={min}
            max={max}
            step={step}
            value={internal}
            onChange={handleSliderChange}
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
            onChange={handleNumberChange}
            step={step}
            min={min}
            max={max}
            required={false}
            disabled={disabled}
          />
          <Typography variant="pi" textColor="neutral600">
            ×
          </Typography>
        </Flex>
        <FieldHint />
        <FieldError />
      </Stack>
    </Field>
  );
};

export default TypographyScaleInput;
