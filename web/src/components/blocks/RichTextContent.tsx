import type { CSSProperties } from 'react';

const MIN_SCALE = 0.7;
const MAX_SCALE = 1.8;
const MIN_LINE_HEIGHT = 0.9;
const MAX_LINE_HEIGHT = 1.35;

type Props = {
  body: string;
  fontScale?: number;
};

type RichTextStyle = CSSProperties & {
  ['--richtext-scale']?: string;
};

const clampScale = (value: number) =>
  Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)) * 100) / 100;

const clampLineHeight = (value: number) =>
  Math.round(Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, value)) * 100) / 100;

const formatScaleValue = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString();
};

const resolveScale = (scale?: number | null) => {
  if (typeof scale !== 'number' || !Number.isFinite(scale)) {
    return null;
  }

  const clamped = clampScale(scale);
  const formatted = formatScaleValue(clamped);
  const lineHeight = clampLineHeight(clamped);

  return {
    numeric: clamped,
    string: formatted,
    lineHeight,
  };
};

const RichTextContent = ({ body, fontScale }: Props) => {
  const resolvedScale = resolveScale(fontScale);
  const style: RichTextStyle | undefined =
    resolvedScale !== null
      ? {
          '--richtext-scale': resolvedScale.string,
          fontSize: `calc(var(--article-font-size) * ${resolvedScale.string})`,
          lineHeight: `calc(var(--article-line-height) * ${formatScaleValue(resolvedScale.lineHeight)})`,
        }
      : undefined;

  return (
    <div
      className="richtext"
      style={style}
      data-font-scale={resolvedScale?.string}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
};

export default RichTextContent;
