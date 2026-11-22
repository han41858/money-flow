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

export const nodeHeight = 48;
export const nameX = 38;
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
      80,
      Math.ceil(measure(cardLabel(name), nameFontSize, true)) + nameX + 14,
    ),
    height: nodeHeight,
  };
}
