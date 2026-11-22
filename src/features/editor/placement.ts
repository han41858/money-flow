import type { MoneyNode } from '../../types/diagram';
import type { Group, NodeSizes, Size } from '../groups/geometry';
import { cardSize } from '../nodes/sizing';
import type { Kind } from './store';

// Place new nodes in the visible canvas and leave room for handles and edge labels.
export function insertionPoint(
  kind: Kind,
  nodes: MoneyNode[],
  topLeft: MoneyNode['position'],
  bottomRight: MoneyNode['position'],
  groups: Group[],
  size: Size,
  sizes: NodeSizes,
) {
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  const ratios = { income: 0.12, account: 0.43, card: 0.57, expense: 0.86 };
  const x = topLeft.x + Math.max(0, width - size.width) * ratios[kind];
  const initialY = topLeft.y + Math.max(0, height - size.height) * 0.43;
  // Leave the header available as a drag handle when inserting near a group's top edge.
  const headers = groups.map((g) => ({
    x: g.position.x,
    y: g.position.y,
    width: g.width,
    height: 36,
  }));
  const coversHeader = (cx: number, cy: number, h: (typeof headers)[number]) =>
    cx < h.x + h.width &&
    cx + size.width > h.x &&
    cy < h.y + h.height &&
    cy + size.height > h.y;
  const y = headers.reduce(
    (cy, h) => (coversHeader(x, cy, h) ? h.y + h.height : cy),
    initialY,
  );
  const occupied = nodes.map((node) => ({
    ...node.position,
    ...(sizes.get(node.id) ?? cardSize(node.name)),
  }));
  const free = (cx: number, cy: number) =>
    !headers.some((h) => coversHeader(cx, cy, h)) &&
    occupied.every(
      (node) =>
        cx + size.width + 20 <= node.x ||
        node.x + node.width + 20 <= cx ||
        cy + size.height + 24 <= node.y ||
        node.y + node.height + 24 <= cy,
    );
  for (const oy of [0, 135, -135, 270, -270]) {
    for (const ox of [0, 215, -215]) {
      const cx = x + ox;
      const cy = y + oy;
      if (
        cx >= topLeft.x &&
        cx + size.width <= bottomRight.x &&
        cy >= topLeft.y &&
        cy + size.height <= bottomRight.y &&
        free(cx, cy)
      )
        return { x: cx, y: cy };
    }
  }
  let nextY = y;
  while (!free(x, nextY)) nextY += 135;
  return { x, y: nextY };
}
