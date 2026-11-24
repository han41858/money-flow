import { getBezierPath, Position } from '@xyflow/react';
import { estimatedTextWidth, nodeHeight } from '../nodes/sizing';

const labelFontSize = 13;

export function portFraction(index: number, count: number) {
  return (index + 0.5) / count;
}

type Point = { x: number; y: number };

function interpolate(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function offset(point: Point, normal: Point, distance: number): Point {
  return { x: point.x + normal.x * distance, y: point.y + normal.y * distance };
}

function svgPoint({ x, y }: Point) {
  return x + ',' + y;
}

function taper(path: string, width: number, end: number) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = path
    .slice(1)
    .split(/[C, ]+/)
    .map(Number);
  const start = { x: x0, y: y0 };
  const control1 = { x: x1, y: y1 };
  const control2 = { x: x2, y: y2 };
  const finish = { x: x3, y: y3 };
  // Allow a longer taper on shallow connections while preserving the full
  // stroke through steep bends and the turn of a backward connection.
  const terminalRun = finish.x - control2.x;
  const backwardRun = Math.max(0, control1.x - control2.x);
  const rise = Math.abs(finish.y - start.y);
  const taperShare = 0.42 / (1 + rise / (2 * Math.max(terminalRun, 1)));
  const turnLimit = terminalRun / (2 * backwardRun + terminalRun);
  const t = 1 - Math.min(taperShare, turnLimit || 0.14);
  const a = interpolate(start, control1, t);
  const b = interpolate(control1, control2, t);
  const c = interpolate(control2, finish, t);
  const d = interpolate(a, b, t);
  const e = interpolate(b, c, t);
  const joint = interpolate(d, e, t);
  const dx = e.x - joint.x;
  const dy = e.y - joint.y;
  const magnitude = Math.hypot(dx, dy);
  const normal = magnitude
    ? { x: -dy / magnitude, y: dx / magnitude }
    : { x: 0, y: 1 };
  const terminalNormal = { x: 0, y: 1 };
  // Overlap the stroke slightly to avoid an antialiased seam at the join.
  const overlap = offset(joint, { x: normal.y, y: -normal.x }, -0.35);
  const side = (sign: number) => [
    svgPoint(offset(overlap, normal, (sign * width) / 2)),
    svgPoint(offset(e, normal, (sign * width) / 2)),
    svgPoint(offset(c, terminalNormal, sign * end)),
    svgPoint(offset(finish, terminalNormal, sign * end)),
  ];
  const [p0, p1, p2, p3] = side(1);
  const [q0, q1, q2, q3] = side(-1);
  return {
    body: `M${svgPoint(start)} C${svgPoint(a)} ${svgPoint(d)} ${svgPoint(joint)}`,
    shaft: `M${p0} C${p1} ${p2} ${p3} L${q3} C${q2} ${q1} ${q0} Z`,
  };
}

export type Box = { x: number; y: number; width: number; height: number };

// Tells whether an amount label centered on a point would cover a card.
export function labelBlocker(text: string, cards: Box[]) {
  const halfWidth = (estimatedTextWidth(text, labelFontSize) + 12) / 2 + 2;
  const halfHeight = 14;
  return (x: number, y: number) =>
    cards.some(
      (card) =>
        x + halfWidth > card.x &&
        x - halfWidth < card.x + card.width &&
        y + halfHeight > card.y &&
        y - halfHeight < card.y + card.height,
    );
}

// Returns the point of a forward curve at a horizontal position.
function curvePoint(path: string, x: number): Point | undefined {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = path
    .slice(1)
    .split(/[C, ]+/)
    .map(Number);
  // Backward connections double back, so they have no single point per x.
  if (x3 <= x0 || x1 > x2) return;
  if (x >= x3) return { x, y: y3 };
  const at = (a: number, b: number, c: number, d: number, t: number) =>
    (1 - t) ** 3 * a +
    3 * (1 - t) ** 2 * t * b +
    3 * (1 - t) * t ** 2 * c +
    t ** 3 * d;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step++) {
    const t = (low + high) / 2;
    if (at(x0, x1, x2, x3, t) < x) low = t;
    else high = t;
  }
  return { x, y: at(y0, y1, y2, y3, low) };
}

export function transferGeometry(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  width: number,
  targetPortCount: number,
  blocked?: (x: number, y: number) => boolean,
) {
  const tip = targetX - 7;
  const pitch = nodeHeight / targetPortCount;
  const half = Math.max(2, Math.min(width / 2 + 5, pitch / 2 - 1));
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY);
  const desiredLength = Math.min(34, Math.max(22, width * 2, distance * 0.045));
  const gap = tip - sourceX;
  const length =
    gap > 0 ? Math.min(desiredLength, Math.max(8, gap * 0.7)) : desiredLength;
  const base = tip - length;
  const curve = {
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetX: base,
    targetY,
    targetPosition: Position.Left,
  };
  const [path, x, y] = getBezierPath(curve);
  const end = Math.min(
    width / 2,
    Math.max(1, half - 2),
    Math.max(1, width / 4),
  );
  const { body, shaft } = taper(path, width, end);
  const arrow =
    'M ' +
    base +
    ' ' +
    (targetY - half) +
    ' L ' +
    tip +
    ' ' +
    targetY +
    ' L ' +
    base +
    ' ' +
    (targetY + half) +
    ' Z';
  // The arrow shortens the curve, so its midpoint would push the label toward
  // the source card. Center the label between the two cards instead, and lift
  // it off the arrow when they would touch.
  const place = (labelX: number): Point => {
    const point = curvePoint(path, labelX) ?? { x, y };
    const nearArrow =
      Math.abs(point.x - tip) < length + 28 &&
      Math.abs(point.y - targetY) < half + 12;
    return nearArrow ? { x: point.x, y: point.y - 22 } : point;
  };
  const center = (sourceX + targetX) / 2;
  let label = place(center);
  // A connection that skips a column can pass a card. Slide the label along
  // the curve to the nearest free spot.
  if (blocked?.(label.x, label.y) && curvePoint(path, center))
    for (let shift = 8; shift < (targetX - sourceX) / 2 - 8; shift += 8) {
      const free = [center + shift, center - shift]
        .map(place)
        .find((point) => !blocked(point.x, point.y));
      if (!free) continue;
      label = free;
      break;
    }
  return { path, body, shaft, arrow, ...label };
}
