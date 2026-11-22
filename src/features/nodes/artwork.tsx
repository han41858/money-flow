import type { FlowNode } from '../editor/graph';
import { defaultNodeSize, type Size } from '../groups/geometry';
import { strokeColor, tint } from '../../lib/brands/palette';

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
  gradientId: string;
  decorative?: boolean;
  x?: number;
  y?: number;
};

export function NodeArtwork({
  data,
  layout,
  size,
  gradientId,
  decorative = false,
  x = 0,
  y = 0,
}: Props) {
  const { color, Icon, kind } = data.appearance;
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
      <defs>
        <linearGradient id={gradientId} x2="100%" y2="20%">
          <stop stopColor={tint(color, 0.1)} />
          <stop offset="1" stopColor={tint(color, 0.04)} />
        </linearGradient>
      </defs>
      <rect
        x={1}
        y={1}
        width={width - 2}
        height={height - 2}
        rx={12}
        fill={'url(#' + gradientId + ')'}
        stroke={strokeColor(color)}
        strokeWidth={1.6}
      />
      <rect
        x={18}
        y={15}
        width={25}
        height={25}
        rx={6}
        fill={tint(color, 0.16)}
      />
      <Icon
        x={21.5}
        y={18.5}
        width={18}
        height={18}
        color="#314937"
        aria-hidden="true"
      />
      <text x={50} y={32} fontSize={12} fontWeight={650} fill="#48584f">
        {kind}
      </text>
      <text fontSize={18} fontWeight={700} fill="#1c2923">
        {layout.names.map((line, i) => (
          <tspan key={i} x={18} y={65 + i * 25}>
            {line}
          </tspan>
        ))}
      </text>
    </svg>
  );
}
