import {
  colorPattern,
  type Diagram,
  type MoneyNode,
} from '../../types/diagram';
import {
  absoluteFrom,
  assignGroup,
  membersAfterResize,
  relativeTo,
  type Group,
  type NodeSizes,
  type Size,
} from '../groups/geometry';
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
  const group = {
    ...bounds,
    id: crypto.randomUUID(),
    name: '새 그룹',
    color: groupColors[d.groups.length % groupColors.length],
  };
  const groups = [...d.groups, group];
  return {
    change: {
      groups,
      nodes: membersAfterResize(d.nodes, groups, group, sizes),
    },
    id: group.id,
  };
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
  const region = { ...group, ...size };
  const groups = d.groups.map((g) => (g === group ? region : g));
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
  const groups = d.groups.map((g) => {
    const point = groupPositions.get(g.id);
    if (!point || (point.x === g.position.x && point.y === g.position.y))
      return g;
    deltas.set(g.id, relativeTo(point, g.position));
    return { ...g, position: point };
  });
  const nodes = d.nodes.map((n) => {
    const delta = n.groupId && deltas.get(n.groupId);
    if (delta) return { ...n, position: absoluteFrom(n.position, delta) };
    const point = positions.get(n.id);
    if (!point) return n;
    const moved =
      point.x === n.position.x && point.y === n.position.y
        ? n
        : { ...n, position: point };
    return assignGroup(moved, groups, sizes);
  });
  if (deltas.size || nodes.some((n, i) => n !== d.nodes[i]))
    return { groups, nodes };
  return null;
}

export function autoArrange(diagram: Diagram, sizes: NodeSizes): Change {
  if (!diagram.nodes.length) return null;
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
  const groups = d.groups.filter((g) => !selected.groups.includes(g.id));
  const nodes = d.nodes
    .filter((n) => !selected.nodes.includes(n.id))
    .map((n) =>
      n.groupId && selected.groups.includes(n.groupId)
        ? { ...n, groupId: undefined }
        : n,
    );
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
