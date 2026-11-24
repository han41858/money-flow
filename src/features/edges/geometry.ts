import { getBezierPath, Position } from '@xyflow/react';
import { estimatedTextWidth, nodeHeight, portSize } from '../nodes/sizing';

const labelFontSize = 13;
const labelHalfHeight = 14;

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

type Cubic = [Point, Point, Point, Point];

function parseCurve(path: string): Cubic {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = path
    .slice(1)
    .split(/[C, ]+/)
    .map(Number);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    { x: x3, y: y3 },
  ];
}

function taper(
  [start, control1, control2, finish]: Cubic,
  width: number,
  end: number,
) {
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

// Checks the centered label against cards and the bounds of the arrowhead.
export function labelBlocker(text: string, cards: Box[]) {
  const halfWidth = (estimatedTextWidth(text, labelFontSize) + 12) / 2 + 2;
  return (x: number, y: number, arrow?: Box) => {
    const overlaps = (box: Box) =>
      x + halfWidth > box.x &&
      x - halfWidth < box.x + box.width &&
      y + labelHalfHeight > box.y &&
      y - labelHalfHeight < box.y + box.height;
    return Boolean(arrow && overlaps(arrow)) || cards.some(overlaps);
  };
}

function curveDistances([start, control1, control2, finish]: Cubic) {
  const segments = 64;
  const samples = [{ point: start, length: 0 }];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    const point = {
      x:
        u ** 3 * start.x +
        3 * u ** 2 * t * control1.x +
        3 * u * t ** 2 * control2.x +
        t ** 3 * finish.x,
      y:
        u ** 3 * start.y +
        3 * u ** 2 * t * control1.y +
        3 * u * t ** 2 * control2.y +
        t ** 3 * finish.y,
    };
    const previous = samples[i - 1];
    const length =
      previous.length +
      Math.hypot(point.x - previous.point.x, point.y - previous.point.y);
    samples.push({ point, length });
  }

  return {
    length: samples[segments].length,
    at(distance: number) {
      let low = 0;
      let high = segments;
      while (high - low > 1) {
        const mid = (low + high) >> 1;
        if (samples[mid].length < distance) low = mid;
        else high = mid;
      }
      const from = samples[low];
      const to = samples[high];
      const span = to.length - from.length;
      return span
        ? interpolate(from.point, to.point, (distance - from.length) / span)
        : from.point;
    },
  };
}

function placeLabel(
  curve: Cubic,
  arrow: Box,
  blocked: ReturnType<typeof labelBlocker>,
  targetX: number,
) {
  const distances = curveDistances(curve);
  const middle = distances.length / 2;
  const center = distances.at(middle);
  if (!blocked(center.x, center.y, arrow)) return center;

  // Either direction can have a closer clear spot, including on backward edges.
  const step = Math.max(1, middle / 128);
  for (let shift = step; shift <= middle; shift += step) {
    const before = distances.at(middle - shift);
    const after = distances.at(middle + shift);
    if (!blocked(before.x, before.y, arrow)) return before;
    if (!blocked(after.x, after.y, arrow)) return after;
  }

  // In a tight gap the label may not fit anywhere on the shaft. Keep it
  // between the cards and clear of the arrow where possible.
  const fallbackX = (curve[0].x + targetX) / 2;
  const fallbackY = Math.min(center.y, arrow.y - labelHalfHeight);
  for (let lift = 0; lift <= portSize; lift++) {
    const y = fallbackY - lift;
    if (!blocked(fallbackX, y, arrow)) return { x: fallbackX, y };
  }
  return center;
}

export function transferGeometry(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  width: number,
  targetPortCount: number,
  blocked = labelBlocker('', []),
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
  const [path] = getBezierPath(curve);
  const cubic = parseCurve(path);
  const end = Math.min(
    width / 2,
    Math.max(1, half - 2),
    Math.max(1, width / 4),
  );
  const { body, shaft } = taper(cubic, width, end);
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
  const label = placeLabel(
    cubic,
    { x: base, y: targetY - half, width: length, height: half * 2 },
    blocked,
    targetX,
  );
  return { path, body, shaft, arrow, ...label };
}
