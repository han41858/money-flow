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

export const nodeHeight = 40;
export const totalFontSize = 11;
export const totalLineHeight = 12;
export const nameX = 32;
export const nameFontSize = 15;

export function cardLabel(name: string) {
  return name.replace(/\s+/g, ' ').trim();
}

export function cardSize(
  name: string,
  measure: MeasureText = estimatedTextWidth,
) {
  return {
    width: Math.max(
      72,
      Math.ceil(measure(cardLabel(name), nameFontSize, true)) + nameX + 9,
    ),
    height: nodeHeight,
  };
}

export type NodeTotal = {
  side: 'left' | 'right';
  label: string;
  description: string;
};

export function layoutTotals(
  totals: NodeTotal[],
  width: number,
  measure: MeasureText,
) {
  const labels = totals.map((total) => ({
    ...total,
    labelWidth: measure(total.label, totalFontSize),
  }));
  const extra =
    labels.length === 2
      ? Math.max(0, labels[0].labelWidth + labels[1].labelWidth + 6 - width) / 2
      : 0;
  return labels.map((total) => ({
    ...total,
    x: total.side === 'left' ? -extra : width + extra,
  }));
}
