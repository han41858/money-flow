import type { Diagram, MoneyNode } from '../../types/diagram';
import {
  defaultNodeSize,
  newGroupBounds,
  type Group,
  type NodeSizes,
} from '../groups/geometry';

const columnGap = 152;
const rowGap = 48;
const regionGap = 44;
const typeOrder = { income: 0, account: 1, card: 2, expense: 3 };

export function arrangeDiagram(diagram: Diagram, sizes: NodeSizes) {
  const ordered = [...diagram.nodes].sort(
    (a, b) =>
      typeOrder[a.type] - typeOrder[b.type] ||
      a.position.y - b.position.y ||
      a.position.x - b.position.x,
  );
  const outgoing = new Map(ordered.map((n) => [n.id, [] as string[]]));
  const indegree = new Map(ordered.map((n) => [n.id, 0]));
  const ranks = new Map(ordered.map((n) => [n.id, 0]));
  for (const { source, target } of diagram.edges) {
    outgoing.get(source)!.push(target);
    indegree.set(target, indegree.get(target)! + 1);
  }

  const remaining = new Set(diagram.nodes.map((n) => n.id));
  const ready = [...remaining].filter((id) => indegree.get(id) === 0);
  for (let cursor = 0; remaining.size; cursor++) {
    // A cycle has no ready node. Break the tie in the same order as the input.
    const id = ready[cursor] ?? remaining.values().next().value!;
    if (cursor === ready.length) ready.push(id);
    remaining.delete(id);
    for (const target of outgoing.get(id)!) {
      if (!remaining.has(target)) continue;
      ranks.set(target, Math.max(ranks.get(target)!, ranks.get(id)! + 1));
      const count = indegree.get(target)! - 1;
      indegree.set(target, count);
      if (count === 0) ready.push(target);
    }
  }

  const columnWidth = ordered.reduce(
    (width, n) => Math.max(width, sizes.get(n.id)?.width ?? 0),
    defaultNodeSize.width,
  );
  const columnX = (id: string) => ranks.get(id)! * (columnWidth + columnGap);
  const members = new Map(diagram.groups.map((g) => [g.id, [] as MoneyNode[]]));
  const ungrouped: MoneyNode[] = [];
  for (const node of ordered) {
    const group = node.groupId && members.get(node.groupId);
    (group || ungrouped).push(node);
  }

  const placed: Pick<Group, 'position' | 'width' | 'height'>[] = [];
  function pack(bounds: (typeof placed)[number]) {
    const { x } = bounds.position;
    const y = placed.reduce((bottom, region) => {
      const left = region.position.x;
      const overlaps =
        x < left + region.width + regionGap &&
        x + bounds.width + regionGap > left;
      return overlaps
        ? Math.max(bottom, region.position.y + region.height + regionGap)
        : bottom;
    }, 0);
    const result = { ...bounds, position: { x, y } };
    placed.push(result);
    return result;
  }

  const positions = new Map<string, MoneyNode['position']>();
  const groups = diagram.groups.map((group) => {
    const contents = members.get(group.id)!;
    const nextRow = new Map<number, number>();
    const nodes = contents.map((node) => {
      const x = columnX(node.id);
      const y = nextRow.get(x) ?? 0;
      nextRow.set(
        x,
        y + (sizes.get(node.id) ?? defaultNodeSize).height + rowGap,
      );
      return { ...node, position: { x, y } };
    });
    const bounds = nodes.length
      ? newGroupBounds(nodes, sizes, { x: 0, y: 0 })
      : { position: { x: 0, y: 0 }, width: group.width, height: group.height };
    const packed = pack(bounds);
    for (const node of nodes) {
      positions.set(node.id, {
        x: node.position.x,
        y: node.position.y + packed.position.y - bounds.position.y,
      });
    }
    return { ...group, ...packed };
  });
  for (const node of ungrouped) {
    const size = sizes.get(node.id) ?? defaultNodeSize;
    const bounds = pack({ ...size, position: { x: columnX(node.id), y: 0 } });
    positions.set(node.id, bounds.position);
  }

  const nodes = diagram.nodes.map((node) => ({
    ...node,
    position: positions.get(node.id)!,
  }));
  return { nodes, groups };
}
