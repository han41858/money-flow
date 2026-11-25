import {
  colorPattern,
  type Diagram,
  type MoneyNode,
} from '../../types/diagram';
import {
  absoluteFrom,
  assignGroup,
  assignParent,
  membersAfterResize,
  rectsOverlap,
  relativeTo,
  type Group,
  type NodeSizes,
  type Size,
} from '../groups/geometry';
import { groupDepths, groupsInLayerOrder } from '../groups/hierarchy';
import { cardSize } from '../nodes/sizing';
import { arrangeDiagram } from './arrange';
import type { Selection } from './store';

// Each operation returns the part of the diagram that changes, or null when
// the operation would change nothing.
type Change = Partial<Diagram> | null;
type Position = MoneyNode['position'];

const groupColors = ['#92ab86', '#86aabe', '#c2a0ae', '#b6a478'];

export function addGroup(
  d: Diagram,
  bounds: Pick<Group, 'position' | 'width' | 'height'>,
  sizes: NodeSizes,
) {
  const { position: start, width, height } = bounds;
  const occupied = [
    ...d.nodes.map((node) => ({
      ...node.position,
      ...(sizes.get(node.id) ?? cardSize(node.name)),
    })),
    ...d.groups.map((group) => ({
      ...group.position,
      width: group.width,
      height: group.height,
    })),
  ];
  const gap = 20;
  const candidates = [start];
  for (const rect of occupied) {
    candidates.push(
      { x: rect.x - width - gap, y: start.y },
      { x: rect.x + rect.width + gap, y: start.y },
      { x: start.x, y: rect.y - height - gap },
      { x: start.x, y: rect.y + rect.height + gap },
    );
  }
  const distance = ({ x, y }: Position) =>
    Math.abs(x - start.x) + Math.abs(y - start.y);
  // A candidate past the rightmost obstacle is always available.
  const position = candidates
    .sort((a, b) => distance(a) - distance(b))
    .find(
      (point) =>
        !occupied.some((rect) =>
          rectsOverlap({ ...point, width, height }, rect),
        ),
    )!;
  const group = {
    position,
    width,
    height,
    id: crypto.randomUUID(),
    name: '새 그룹',
    color: groupColors[d.groups.length % groupColors.length],
  };
  return { change: { groups: [...d.groups, group] }, id: group.id };
}

export function editGroup(
  d: Diagram,
  id: string,
  patch: Partial<Pick<Group, 'name' | 'color'>>,
): Change {
  const group = d.groups.find((g) => g.id === id);
  if (!group) return null;
  const name = patch.name?.trim() ?? group.name;
  const color = patch.color ?? group.color;
  if (
    !name ||
    !colorPattern.test(color) ||
    (name === group.name && color === group.color)
  )
    return null;
  return {
    groups: d.groups.map((g) => (g === group ? { ...g, name, color } : g)),
  };
}

export function resizeGroup(
  d: Diagram,
  id: string,
  size: Size,
  sizes: NodeSizes,
): Change {
  const group = d.groups.find((g) => g.id === id);
  if (
    !group ||
    !(size.width > 0 && size.height > 0) ||
    !Number.isFinite(size.width + size.height) ||
    (size.width === group.width && size.height === group.height)
  )
    return null;
  const region = assignParent({ ...group, ...size }, d.groups);
  const groups = d.groups.map((g) => (g === group ? region : g));
  for (const [index, child] of groups.entries())
    if (child.parentId === id) groups[index] = assignParent(child, groups);
  return {
    groups,
    nodes: membersAfterResize(d.nodes, groups, region, sizes),
  };
}

// Moving a group carries its members. A node moved on its own is assigned to
// the group it lands in.
export function moveItems(
  d: Diagram,
  positions: Map<string, Position>,
  groupPositions: Map<string, Position>,
  sizes: NodeSizes,
): Change {
  const deltas = new Map<string, Position>();
  const moved = new Map<string, Group>();
  const dropped = new Set<string>();
  for (const group of groupsInLayerOrder(d.groups)) {
    const inherited = group.parentId ? deltas.get(group.parentId) : undefined;
    const point = inherited
      ? absoluteFrom(group.position, inherited)
      : groupPositions.get(group.id);
    if (
      !point ||
      (point.x === group.position.x && point.y === group.position.y)
    )
      continue;
    deltas.set(group.id, relativeTo(point, group.position));
    moved.set(group.id, { ...group, position: point });
    if (!inherited) dropped.add(group.id);
  }
  const groups = d.groups.map((group) => moved.get(group.id) ?? group);
  for (const [index, group] of groups.entries())
    if (dropped.has(group.id)) groups[index] = assignParent(group, groups);
  const depths = groupDepths(groups)!;
  const nodes = d.nodes.map((n) => {
    const delta = n.groupId && deltas.get(n.groupId);
    if (delta) return { ...n, position: absoluteFrom(n.position, delta) };
    const point = positions.get(n.id);
    if (!point) return n;
    const moved =
      point.x === n.position.x && point.y === n.position.y
        ? n
        : { ...n, position: point };
    return assignGroup(moved, groups, sizes, depths);
  });
  if (deltas.size || nodes.some((n, i) => n !== d.nodes[i]))
    return { groups, nodes };
  return null;
}

export function autoArrange(diagram: Diagram, sizes: NodeSizes): Change {
  if (!diagram.nodes.length && !diagram.groups.some((g) => g.parentId))
    return null;
  const arranged = arrangeDiagram(diagram, sizes);
  const moved = (next: Position, previous: Position) =>
    next.x !== previous.x || next.y !== previous.y;
  if (
    arranged.nodes.some((node, i) =>
      moved(node.position, diagram.nodes[i].position),
    ) ||
    arranged.groups.some((group, i) => {
      const previous = diagram.groups[i];
      return (
        moved(group.position, previous.position) ||
        group.width !== previous.width ||
        group.height !== previous.height
      );
    })
  )
    return arranged;
  return null;
}

// Removing a node removes its links. Removing a group keeps its members.
export function removeSelection(d: Diagram, selected: Selection): Change {
  const removed = new Map(
    d.groups
      .filter((group) => selected.groups.includes(group.id))
      .map(({ id, parentId }) => [id, parentId]),
  );
  function survivingParent(id: string | undefined) {
    while (id !== undefined && removed.has(id)) id = removed.get(id);
    return id;
  }
  const groups = d.groups
    .filter((g) => !removed.has(g.id))
    .map((group) => {
      const parentId = survivingParent(group.parentId);
      return parentId === group.parentId ? group : { ...group, parentId };
    });
  const nodes = d.nodes
    .filter((n) => !selected.nodes.includes(n.id))
    .map((node) => {
      const groupId = survivingParent(node.groupId);
      return groupId === node.groupId ? node : { ...node, groupId };
    });
  const edges = d.edges.filter(
    (e) =>
      !selected.edges.includes(e.id) &&
      !selected.nodes.includes(e.source) &&
      !selected.nodes.includes(e.target),
  );
  if (
    groups.length !== d.groups.length ||
    nodes.length !== d.nodes.length ||
    edges.length !== d.edges.length
  )
    return { groups, nodes, edges };
  return null;
}
