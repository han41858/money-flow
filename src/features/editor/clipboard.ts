import type { Diagram, MoneyNode } from '../../types/diagram';
import { institutions } from '../../lib/brands/registry';
import {
  absoluteFrom,
  assignGroup,
  rectsOverlap,
  relativeTo,
} from '../groups/geometry';
import { groupsInLayerOrder } from '../groups/hierarchy';
import { cardSize, type MeasureText } from '../nodes/sizing';

type Position = MoneyNode['position'];
export type NodeClipboard = Pick<
  Diagram,
  'nodes' | 'edges' | 'customInstitutions'
> &
  Partial<Pick<Diagram, 'groups'>>;

// Expand selected groups before collecting nodes and internal links.
export function copyNodes(
  diagram: Diagram,
  selected: readonly string[],
  selectedGroups: readonly string[] = [],
): NodeClipboard | null {
  const groupIds = new Set(selectedGroups);
  if (groupIds.size) {
    for (const group of groupsInLayerOrder(diagram.groups)) {
      if (group.parentId && groupIds.has(group.parentId))
        groupIds.add(group.id);
    }
  }
  const groups = diagram.groups.filter((group) => groupIds.has(group.id));
  const ids = new Set(selected);
  const nodes = diagram.nodes.filter((node) => {
    if (node.groupId && groupIds.has(node.groupId)) ids.add(node.id);
    return ids.has(node.id);
  });
  if (!nodes.length && !groups.length) return null;
  const brands = new Set(nodes.map((node) => node.institutionId));
  return {
    nodes,
    ...(groups.length ? { groups } : {}),
    edges: diagram.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
    customInstitutions: diagram.customInstitutions.filter((brand) =>
      brands.has(brand.id),
    ),
  };
}

// Returns the diagram change that pastes the clipboard around `center`, and
// the IDs given to the pasted nodes.
export function pasteNodes(
  diagram: Diagram,
  clipboard: NodeClipboard,
  center: Position,
  measure?: MeasureText,
) {
  const customInstitutions = [...diagram.customInstitutions];
  const brandIds = new Map(
    clipboard.customInstitutions.map((brand) => {
      const existing = [...institutions, ...customInstitutions].find(
        (item) => item.name === brand.name.trim(),
      );
      if (existing) return [brand.id, existing.id];
      const copy = { ...brand, id: crypto.randomUUID() };
      customInstitutions.push(copy);
      return [brand.id, copy.id];
    }),
  );
  const boundsOf = (node: MoneyNode) => ({
    ...node.position,
    ...cardSize(node.name, measure),
  });
  const copied = clipboard.nodes.map(boundsOf);
  const copiedGroups = clipboard.groups ?? [];
  const groupBounds = ({
    position,
    width,
    height,
  }: Diagram['groups'][number]) => ({
    ...position,
    width,
    height,
  });
  const bounds = [...copied, ...copiedGroups.map(groupBounds)];
  const origin = {
    x:
      (Math.min(...bounds.map(({ x }) => x)) +
        Math.max(...bounds.map(({ x, width }) => x + width))) /
      2,
    y:
      (Math.min(...bounds.map(({ y }) => y)) +
        Math.max(...bounds.map(({ y, height }) => y + height))) /
      2,
  };
  const occupied = diagram.nodes.map(boundsOf);
  if (copiedGroups.length) occupied.push(...diagram.groups.map(groupBounds));
  const positions = bounds.map((rect) =>
    absoluteFrom(relativeTo(rect, origin), center),
  );
  // Shift the entire paste together until it clears the occupied area.
  let shift = 0;
  const shifted = ({ x, y }: Position) => ({ x: x + shift, y: y + shift });
  while (
    positions.some((point, index) => {
      const { width, height } = bounds[index];
      const pasted = { ...shifted(point), width, height };
      return occupied.some((node) => rectsOverlap(pasted, node));
    })
  )
    shift += 28;

  const ids = new Map(
    clipboard.nodes.map((node) => [node.id, crypto.randomUUID()]),
  );
  const sizes = new Map(
    clipboard.nodes.map((node, i) => {
      const { width, height } = copied[i];
      return [ids.get(node.id)!, { width, height }];
    }),
  );
  const groupIds = new Map(
    copiedGroups.map((group) => [group.id, crypto.randomUUID()]),
  );
  const groups = copiedGroups.map((group, i) => ({
    ...group,
    id: groupIds.get(group.id)!,
    parentId: group.parentId ? groupIds.get(group.parentId) : undefined,
    position: shifted(positions[copied.length + i]),
  }));
  const nodes = clipboard.nodes.map((node, i) => {
    const groupId = node.groupId ? groupIds.get(node.groupId) : undefined;
    const pasted = {
      ...node,
      id: ids.get(node.id)!,
      position: shifted(positions[i]),
      institutionId:
        brandIds.get(node.institutionId ?? '') ?? node.institutionId,
    };
    return groupId
      ? { ...pasted, groupId }
      : assignGroup(pasted, diagram.groups, sizes);
  });
  const edges = clipboard.edges.map((edge) => ({
    ...edge,
    id: crypto.randomUUID(),
    source: ids.get(edge.source)!,
    target: ids.get(edge.target)!,
  }));
  return {
    change: {
      nodes: [...diagram.nodes, ...nodes],
      edges: [...diagram.edges, ...edges],
      customInstitutions,
      ...(groups.length ? { groups: [...diagram.groups, ...groups] } : {}),
    },
    ids: nodes.map((node) => node.id),
    selection: {
      nodes: clipboard.nodes
        .filter((node) => !node.groupId || !groupIds.has(node.groupId))
        .map((node) => ids.get(node.id)!),
      edges: [],
      groups: groups
        .filter((group) => !group.parentId)
        .map((group) => group.id),
    },
  };
}
