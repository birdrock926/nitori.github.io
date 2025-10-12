import type { CSSProperties } from 'react';

const MIN_SCALE = 0.7;
const MAX_SCALE = 1.8;

type Props = {
  body: string;
  fontScale?: number;
  alignment?: 'left' | 'center' | 'right' | 'justify';
};

type RichTextStyle = CSSProperties & {
  ['--richtext-scale']?: string;
};

const clampScale = (value: number) =>
  Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)) * 100) / 100;

const resolveScale = (scale?: number | null) => {
  if (typeof scale !== 'number' || !Number.isFinite(scale)) {
    return null;
  }

  return clampScale(scale).toString();
};

const ALLOWED_ALIGNMENTS: Record<'left' | 'center' | 'right' | 'justify', string> = {
  left: 'richtext-align-left',
  center: 'richtext-align-center',
  right: 'richtext-align-right',
  justify: 'richtext-align-justify',
};

const RichTextContent = ({ body, fontScale, alignment }: Props) => {
  const normalizedScale = resolveScale(fontScale);
  const style: RichTextStyle | undefined =
    normalizedScale !== null ? { '--richtext-scale': normalizedScale } : undefined;
  const alignmentClass = alignment ? ALLOWED_ALIGNMENTS[alignment] : undefined;
  const className = alignmentClass ? `richtext ${alignmentClass}` : 'richtext';

  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: body }} />;
};

export default RichTextContent;
