export const canvasColor = '#f8faf8';

function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const l = luminance(a),
    r = luminance(b);
  return (Math.max(l, r) + 0.05) / (Math.min(l, r) + 0.05);
}
export function strokeColor(color: string, background = canvasColor) {
  const channels = rgb(color);
  let result = color;
  for (let step = 1; step <= 100 && contrast(result, background) < 3; step++) {
    result =
      '#' +
      channels
        .map((c) =>
          Math.round(c * (1 - step / 100))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
  }
  return result;
}
