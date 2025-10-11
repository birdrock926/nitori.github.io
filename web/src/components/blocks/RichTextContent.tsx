import type { CSSProperties } from 'react';

import { normalizeRichMarkup } from '@lib/strapi';

const MIN_SCALE = 0.7;
const MAX_SCALE = 1.8;

type Props = {
  body: string;
  fontScale?: number;
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

const RichTextContent = ({ body, fontScale }: Props) => {
  const normalizedScale = resolveScale(fontScale);
  const style: RichTextStyle | undefined =
    normalizedScale !== null ? { '--richtext-scale': normalizedScale } : undefined;

  const html = typeof body === 'string' ? normalizeRichMarkup(body) : '';

  return <div className="richtext" style={style} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default RichTextContent;
