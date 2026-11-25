import type { Diagram, MoneyNode } from '../../types/diagram';
import { cardSize } from '../nodes/sizing';
import { groupDepths } from './hierarchy';

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

function deepestMatchingGroup(
  groups: Group[],
  matches: (group: Group) => boolean,
  depths: ReadonlyMap<string, number> = groupDepths(groups)!,
) {
  let match: Group | undefined;
  let depth = -1;
  // Document order breaks ties between overlapping groups of the same depth.
  for (const group of groups) {
    const candidateDepth = depths.get(group.id)!;
    if (candidateDepth < depth || !matches(group)) continue;
    match = group;
    depth = candidateDepth;
  }
  return match?.id;
}

export function assignGroup(
  node: MoneyNode,
  groups: Group[],
  sizes: NodeSizes,
  depths?: ReadonlyMap<string, number>,
) {
  const groupId = deepestMatchingGroup(
    groups,
    (group) => containsCenter(group, node, sizes),
    depths,
  );
  return groupId === node.groupId ? node : { ...node, groupId };
}

export function assignParent(group: Group, groups: Group[]): Group {
  const byId = new Map(groups.map((candidate) => [candidate.id, candidate]));
  const { position, width, height } = group;
  const parentId = deepestMatchingGroup(groups, (candidate) => {
    const { x, y } = candidate.position;
    if (
      (candidate.width === width && candidate.height === height) ||
      position.x < x ||
      position.y < y ||
      position.x + width > x + candidate.width ||
      position.y + height > y + candidate.height
    )
      return false;
    for (let ancestor: Group | undefined = candidate; ancestor;) {
      if (ancestor.id === group.id) return false;
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
    }
    return true;
  });
  return parentId === group.parentId ? group : { ...group, parentId };
}

export function membersAfterResize(
  nodes: MoneyNode[],
  groups: Group[],
  region: Group,
  sizes: NodeSizes,
) {
  const depths = groupDepths(groups)!;
  return nodes.map((node) =>
    node.groupId === region.id || containsCenter(region, node, sizes)
      ? assignGroup(node, groups, sizes, depths)
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
  return paddedGroupBounds(nodeBounds(selected, sizes));
}

type Bounds = Pick<Group, 'position' | 'width' | 'height'>;

export function paddedGroupBounds({ position, width, height }: Bounds): Bounds {
  return {
    position: { x: position.x - 24, y: position.y - 44 },
    width: width + 48,
    height: height + 68,
  };
}

export function nodeBounds(nodes: MoneyNode[], sizes: NodeSizes): Bounds {
  return enclosingBounds(
    nodes.map((node) => ({
      position: node.position,
      ...(sizes.get(node.id) ?? cardSize(node.name)),
    })),
  );
}

export function enclosingBounds(items: Bounds[]): Bounds {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const { position, width, height } of items) {
    left = Math.min(left, position.x);
    top = Math.min(top, position.y);
    right = Math.max(right, position.x + width);
    bottom = Math.max(bottom, position.y + height);
  }
  return {
    position: { x: left, y: top },
    width: right - left,
    height: bottom - top,
  };
}
