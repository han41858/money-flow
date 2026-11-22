import { getBezierPath, Position } from '@xyflow/react';
import { defaultNodeSize } from '../groups/geometry';

export function portFraction(index: number, count: number) {
  return (index + 0.5) / count;
}

export function transferGeometry(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  width: number,
  targetPortCount: number,
) {
  const tip = targetX - 7;
  const pitch = defaultNodeSize.height / targetPortCount;
  const half = Math.max(2, Math.min(width / 2 + 5, pitch / 2 - 1));
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY);
  const desiredLength = Math.min(34, Math.max(22, width * 2, distance * 0.045));
  const gap = tip - sourceX;
  const length =
    gap > 0 ? Math.min(desiredLength, Math.max(8, gap * 0.7)) : desiredLength;
  const base = tip - length;
  const [path, x, y] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetX: base,
    targetY,
    targetPosition: Position.Left,
  });
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
  const labelNearArrow =
    Math.abs(x - tip) < length + 28 && Math.abs(y - targetY) < half + 12;
  return { path, arrow, x, y: labelNearArrow ? y - 22 : y };
}
