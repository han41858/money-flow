import type { FlowNode } from '../editor/graph';
import { defaultNodeSize, type Size } from '../groups/geometry';
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

function wrapText(
  text: string,
  width: number,
  size: number,
  bold: boolean,
  measure: MeasureText,
) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    const combined = line ? line + ' ' + word : word;
    if (measure(combined, size, bold) <= width) {
      line = combined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const { segment } of graphemes.segment(word)) {
      if (line && measure(line + segment, size, bold) > width) {
        lines.push(line);
        line = '';
      }
      line += segment;
    }
  }
  lines.push(line);
  return lines;
}

export function cardLayout(
  data: FlowNode['data'],
  width: number,
  measure: MeasureText,
) {
  const contentWidth = Math.max(1, width - 36);
  const names = wrapText(data.node.name, contentWidth, 18, true, measure);
  return { names, height: defaultNodeSize.height + (names.length - 1) * 25 };
}

type Props = {
  data: FlowNode['data'];
  layout: ReturnType<typeof cardLayout>;
  size: Size;
  hideName?: boolean;
  hideIcon?: boolean;
  decorative?: boolean;
  x?: number;
  y?: number;
};

export function NodeArtwork({
  data,
  layout,
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
          x={18}
          y={18}
          width={18}
          height={18}
          color="#314937"
          aria-hidden="true"
        />
      )}
      <text
        visibility={hideName ? 'hidden' : undefined}
        fontSize={18}
        fontWeight={700}
        fill="#1c2923"
      >
        {layout.names.map((line, i) => (
          <tspan key={i} x={18} y={65 + i * 25}>
            {line}
          </tspan>
        ))}
      </text>
    </svg>
  );
}
