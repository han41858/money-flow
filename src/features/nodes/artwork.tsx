import type { FlowNode } from '../editor/graph';
import { type Size } from '../groups/geometry';
import { tint } from '../../lib/brands/palette';

export const cardFont =
  "Inter, 'Noto Sans CJK KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
export type MeasureText = (
  value: string,
  size: number,
  bold?: boolean,
) => number;

let context: CanvasRenderingContext2D | null;
export const browserTextWidth: MeasureText = (value, size, bold) => {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return estimatedTextWidth(value, size);
  context.font = (bold ? '700 ' : '400 ') + size + 'px ' + cardFont;
  return context.measureText(value).width;
};

export const estimatedTextWidth: MeasureText = (value, size) =>
  Array.from(value).reduce(
    (width, c) => width + (c.codePointAt(0)! > 255 ? 1 : 0.65) * size,
    0,
  );

const graphemes = new Intl.Segmenter('ko', { granularity: 'grapheme' });

const nameX = 38;
const nameFontSize = 15;

export function cardLabel(name: string, width: number, measure: MeasureText) {
  const available = width - nameX - 14;
  const text = name.replace(/\s+/g, ' ').trim();
  if (measure(text, nameFontSize, true) <= available) return text;

  let prefix = '';
  for (const { segment } of graphemes.segment(text)) {
    if (measure(prefix + segment + '…', nameFontSize, true) > available) break;
    prefix += segment;
  }
  return prefix.trimEnd() + '…';
}

type Props = {
  data: FlowNode['data'];
  label: string;
  size: Size;
  hideName?: boolean;
  hideIcon?: boolean;
  decorative?: boolean;
  x?: number;
  y?: number;
};

export function NodeArtwork({
  data,
  label,
  size,
  hideName = false,
  hideIcon = false,
  decorative = false,
  x = 0,
  y = 0,
}: Props) {
  const { color, Icon } = data.appearance;
  const { width, height } = size;
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      fontFamily={cardFont}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : data.node.name}
    >
      <rect width={width} height={height} rx={12} fill={tint(color, 0.18)} />
      {!hideIcon && (
        <Icon
          x={13}
          y={(height - 18) / 2}
          width={18}
          height={18}
          color="#314937"
          aria-hidden="true"
        />
      )}
      <text
        visibility={hideName ? 'hidden' : undefined}
        x={nameX}
        y={height / 2}
        dominantBaseline="central"
        fontSize={nameFontSize}
        fontWeight={700}
        fill="#1c2923"
      >
        {label}
      </text>
    </svg>
  );
}
