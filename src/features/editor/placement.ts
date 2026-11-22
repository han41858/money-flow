import type { MoneyNode } from '../../types/diagram';
import { defaultNodeSize, type Group } from '../groups/geometry';
import type { Kind } from './store';

// Place new nodes in the visible canvas and leave room for handles and edge labels.
export function insertionPoint(
  kind: Kind,
  nodes: MoneyNode[],
  topLeft: MoneyNode['position'],
  bottomRight: MoneyNode['position'],
  groups: Group[] = [],
) {
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  const ratios = { income: 0.12, account: 0.43, card: 0.57, expense: 0.86 };
  const x =
    topLeft.x + Math.max(0, width - defaultNodeSize.width) * ratios[kind];
  const initialY =
    topLeft.y + Math.max(0, height - defaultNodeSize.height) * 0.43;
  // Leave the header available as a drag handle when inserting near a group's top edge.
  const headers = groups.map((g) => ({
    x: g.position.x,
    y: g.position.y,
    width: g.width,
    height: 36,
  }));
  const coversHeader = (cx: number, cy: number, h: (typeof headers)[number]) =>
    cx < h.x + h.width &&
    cx + defaultNodeSize.width > h.x &&
    cy < h.y + h.height &&
    cy + defaultNodeSize.height > h.y;
  const y = headers.reduce(
    (cy, h) => (coversHeader(x, cy, h) ? h.y + h.height : cy),
    initialY,
  );
  const free = (cx: number, cy: number) =>
    !headers.some((h) => coversHeader(cx, cy, h)) &&
    nodes.every(
      (n) =>
        Math.abs(n.position.x - cx) > 205 || Math.abs(n.position.y - cy) > 122,
    );
  for (const oy of [0, 135, -135, 270, -270]) {
    for (const ox of [0, 215, -215]) {
      const cx = x + ox;
      const cy = y + oy;
      if (
        cx >= topLeft.x &&
        cx + defaultNodeSize.width <= bottomRight.x &&
        cy >= topLeft.y &&
        cy + defaultNodeSize.height <= bottomRight.y &&
        free(cx, cy)
      )
        return { x: cx, y: cy };
    }
  }
  let nextY = y;
  while (!free(x, nextY)) nextY += 135;
  return { x, y: nextY };
}
