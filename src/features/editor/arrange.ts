import type { Diagram, MoneyNode } from '../../types/diagram';
import { newGroupBounds, type Group, type NodeSizes } from '../groups/geometry';
import { cardSize } from '../nodes/sizing';

const columnGap = 96;
const rowGap = 24;
const regionGap = 24;

function byPosition(
  a: Pick<MoneyNode, 'position'>,
  b: Pick<MoneyNode, 'position'>,
) {
  return a.position.y - b.position.y || a.position.x - b.position.x;
}

export function arrangeDiagram(diagram: Diagram, sizes: NodeSizes) {
  const ordered = [...diagram.nodes].sort(byPosition);
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

  const nodeSizes = new Map(
    ordered.map((node) => [node.id, sizes.get(node.id) ?? cardSize(node.name)]),
  );
  const columnWidth = ordered.reduce(
    (width, n) => Math.max(width, nodeSizes.get(n.id)!.width),
    0,
  );
  const columnX = (id: string) => ranks.get(id)! * (columnWidth + columnGap);
  const members = new Map(diagram.groups.map((g) => [g.id, [] as MoneyNode[]]));
  const ungrouped: MoneyNode[] = [];
  for (const node of ordered) {
    const group = node.groupId && members.get(node.groupId);
    (group || ungrouped).push(node);
  }

  type Bounds = Pick<Group, 'position' | 'width' | 'height'>;
  const placed: Array<Bounds & { nodeIds: string[] }> = [];
  function pack(bounds: Bounds, nodeIds: string[]) {
    const { x } = bounds.position;
    const y = placed.reduce((bottom, region) => {
      const left = region.position.x;
      const overlaps =
        x < left + region.width + regionGap &&
        x + bounds.width + regionGap > left;
      return overlaps
        ? Math.max(bottom, region.position.y + region.height + regionGap)
        : bottom;
    }, bounds.position.y);
    const result = { ...bounds, position: { x, y } };
    placed.push({ ...result, nodeIds });
    return result;
  }

  const positions = new Map<string, MoneyNode['position']>();
  const heightOf = (id: string) => nodeSizes.get(id)!.height;
  const groupBounds = new Map<string, Bounds>();
  const regions = [
    ...diagram.groups.map((group) => ({
      group,
      position: group.position,
      contents: members.get(group.id)!,
    })),
    ...ungrouped.map((node) => ({
      group: undefined,
      position: node.position,
      contents: [node],
    })),
  ].sort(byPosition);
  for (const { group, contents } of regions) {
    if (!group) {
      const node = contents[0];
      const size = nodeSizes.get(node.id)!;
      const bounds = pack(
        { ...size, position: { x: columnX(node.id), y: -size.height / 2 } },
        [node.id],
      );
      positions.set(node.id, { ...bounds.position });
      continue;
    }
    const columnHeights = new Map<number, number>();
    for (const node of contents) {
      const x = columnX(node.id);
      columnHeights.set(
        x,
        (columnHeights.get(x) ?? -rowGap) + heightOf(node.id) + rowGap,
      );
    }
    const nextRow = new Map<number, number>();
    const nodes = contents.map((node) => {
      const x = columnX(node.id);
      const y = nextRow.get(x) ?? -columnHeights.get(x)! / 2;
      nextRow.set(x, y + heightOf(node.id) + rowGap);
      return { ...node, position: { x, y } };
    });
    const bounds = nodes.length
      ? newGroupBounds(nodes, nodeSizes, { x: 0, y: 0 })
      : {
          position: { x: 0, y: -group.height / 2 },
          width: group.width,
          height: group.height,
        };
    const packed = pack(
      bounds,
      contents.map((node) => node.id),
    );
    for (const node of nodes) {
      positions.set(node.id, {
        x: node.position.x,
        y: node.position.y + packed.position.y - bounds.position.y,
      });
    }
    groupBounds.set(group.id, packed);
  }

  // Recenter vertical stacks together so moving them cannot introduce overlaps.
  const bands: (typeof placed)[] = [];
  let right = -Infinity;
  for (const region of placed.sort((a, b) => a.position.x - b.position.x)) {
    if (region.position.x >= right + regionGap) {
      bands.push([]);
      right = -Infinity;
    }
    bands.at(-1)!.push(region);
    right = Math.max(right, region.position.x + region.width);
  }
  for (const band of bands) {
    const ids = band.flatMap((region) => region.nodeIds);
    if (!ids.length) continue;
    let top = Infinity;
    let bottom = -Infinity;
    for (const id of ids) {
      const { y } = positions.get(id)!;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + heightOf(id));
    }
    const offset = (top + bottom) / 2;
    for (const region of band) region.position.y -= offset;
    for (const id of ids) positions.get(id)!.y -= offset;
  }

  const nodes = diagram.nodes.map((node) => ({
    ...node,
    position: positions.get(node.id)!,
  }));
  const groups = diagram.groups.map((group) => ({
    ...group,
    ...groupBounds.get(group.id)!,
  }));
  return { nodes, groups };
}
