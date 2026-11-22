import { getBezierPath, Position } from '@xyflow/react';

export function portFraction(index: number, count: number) {
  return (index + 1) / (count + 1);
}

export function transferGeometry(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  width: number,
) {
  // Keep the arrowhead outside the target handle, even on maximum-width transfers.
  const tip = targetX - 7;
  const half = Math.max(5, width / 2 + 3);
  const base = tip - Math.max(10, half * 1.5);
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
  return { path, arrow, x, y };
}
