import type { Diagram } from '../../types/diagram';
import {
  enclosingBounds,
  nodeBounds,
  type NodeSizes,
} from '../groups/geometry';

export function centeredViewport(
  { nodes, groups }: Pick<Diagram, 'nodes' | 'groups'>,
  sizes: NodeSizes,
  canvas: { left: number; top: number },
  visible: { left: number; top: number; right: number; bottom: number },
  currentZoom: number,
) {
  const width = visible.right - visible.left;
  const height = visible.bottom - visible.top;
  if (width <= 0 || height <= 0 || (!nodes.length && !groups.length)) return;

  const bounds = enclosingBounds(
    nodes.length ? [nodeBounds(nodes, sizes), ...groups] : groups,
  );
  const overflows =
    bounds.width * currentZoom > width || bounds.height * currentZoom > height;
  const margin = Math.min(16, width / 4, height / 4);
  const zoom = overflows
    ? Math.min(
        (width - 2 * margin) / bounds.width,
        (height - 2 * margin) / bounds.height,
      )
    : currentZoom;
  return {
    x:
      (visible.left + visible.right) / 2 -
      canvas.left -
      (bounds.position.x + bounds.width / 2) * zoom,
    y:
      (visible.top + visible.bottom) / 2 -
      canvas.top -
      (bounds.position.y + bounds.height / 2) * zoom,
    zoom,
  };
}

export function revealOffset(
  start: number,
  length: number,
  min: number,
  max: number,
  padding = 0,
  keepStartVisible = false,
) {
  if (start < min) return min + padding - start;
  const endOffset = Math.min(0, max - start - length - padding);
  return keepStartVisible ? Math.max(min - start, endOffset) : endOffset;
}
