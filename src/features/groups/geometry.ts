import type { Diagram, MoneyNode } from '../../types/diagram';
import { cardSize } from '../nodes/sizing';

export type Group = Diagram['groups'][number];
type Point = MoneyNode['position'];
export type Size = Pick<Group, 'width' | 'height'>;
export type NodeSizes = ReadonlyMap<string, Size>;
const defaultGroupSize = { width: 320, height: 210 };
export const minGroupSize = { width: 112, height: 64 };

export function measuredSizes(
  nodes: MoneyNode[],
  getNode: (id: string) => { measured: Partial<Size> } | undefined,
): NodeSizes {
  const sizes = new Map<string, Size>();
  for (const node of nodes) {
    const measured = getNode(node.id)?.measured;
    if (measured?.width && measured.height)
      sizes.set(node.id, { width: measured.width, height: measured.height });
  }
  return sizes;
}

export function relativeTo(position: Point, origin: Point): Point {
  return { x: position.x - origin.x, y: position.y - origin.y };
}

export function absoluteFrom(position: Point, origin: Point): Point {
  return { x: position.x + origin.x, y: position.y + origin.y };
}

type Rect = Point & Size;

// True when the rectangles overlap, or come closer than the given gaps.
export function rectsOverlap(a: Rect, b: Rect, gapX = 0, gapY = 0) {
  return (
    a.x < b.x + b.width + gapX &&
    b.x < a.x + a.width + gapX &&
    a.y < b.y + b.height + gapY &&
    b.y < a.y + a.height + gapY
  );
}

function containsCenter(group: Group, node: MoneyNode, sizes: NodeSizes) {
  const { width, height } = sizes.get(node.id) ?? cardSize(node.name);
  const x = node.position.x + width / 2;
  const y = node.position.y + height / 2;
  return (
    x >= group.position.x &&
    x <= group.position.x + group.width &&
    y >= group.position.y &&
    y <= group.position.y + group.height
  );
}

export function assignGroup(
  node: MoneyNode,
  groups: Group[],
  sizes: NodeSizes,
) {
  // Document order is creation order, including after import or undo.
  let groupId: string | undefined;
  for (let i = groups.length - 1; i >= 0; i--) {
    if (containsCenter(groups[i], node, sizes)) {
      groupId = groups[i].id;
      break;
    }
  }
  return groupId === node.groupId ? node : { ...node, groupId };
}

export function membersAfterResize(
  nodes: MoneyNode[],
  groups: Group[],
  region: Group,
  sizes: NodeSizes,
) {
  return nodes.map((node) =>
    node.groupId === region.id || containsCenter(region, node, sizes)
      ? assignGroup(node, groups, sizes)
      : node,
  );
}

export function newGroupBounds(
  selected: MoneyNode[],
  sizes: NodeSizes,
  center: Point,
): Pick<Group, 'position' | 'width' | 'height'> {
  if (!selected.length)
    return {
      ...defaultGroupSize,
      position: {
        x: center.x - defaultGroupSize.width / 2,
        y: center.y - defaultGroupSize.height / 2,
      },
    };
  const { position, width, height } = nodeBounds(selected, sizes);
  return {
    position: { x: position.x - 24, y: position.y - 44 },
    width: width + 48,
    height: height + 68,
  };
}

export function nodeBounds(
  nodes: MoneyNode[],
  sizes: NodeSizes,
): Pick<Group, 'position' | 'width' | 'height'> {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    const { width, height } = sizes.get(node.id) ?? cardSize(node.name);
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + width);
    bottom = Math.max(bottom, node.position.y + height);
  }
  return {
    position: { x: left, y: top },
    width: right - left,
    height: bottom - top,
  };
}
