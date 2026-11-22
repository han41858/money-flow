import type { Diagram, MoneyNode } from '../../types/diagram';
import {
  newGroupBounds,
  nodeBounds,
  type Group,
  type NodeSizes,
} from '../groups/geometry';
import { cardSize, totalLineHeight } from '../nodes/sizing';

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
  const soleParent = new Map<string, string>();
  const ranks = new Map(ordered.map((n) => [n.id, 0]));
  for (const { source, target } of diagram.edges) {
    outgoing.get(source)!.push(target);
    const count = indegree.get(target)! + 1;
    indegree.set(target, count);
    if (count === 1) soleParent.set(target, source);
    else soleParent.delete(target);
  }

  const nodeSizes = new Map(
    ordered.map((node) => {
      const size = sizes.get(node.id) ?? cardSize(node.name);
      const lines =
        Number(indegree.get(node.id)! >= 2) +
        Number(outgoing.get(node.id)!.length >= 2);
      return [
        node.id,
        { ...size, height: size.height + lines * totalLineHeight },
      ];
    }),
  );

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

  // Use forward links within each group. Merge points and cycle back-edges
  // remain independent so no node belongs to multiple branches.
  const byId = new Map(ordered.map((node) => [node.id, node]));
  const parents = new Map<string, string>();
  const children = new Map(ordered.map((node) => [node.id, [] as MoneyNode[]]));
  for (const node of ordered) {
    const parent = byId.get(soleParent.get(node.id) ?? '');
    if (
      parent &&
      parent.groupId === node.groupId &&
      ranks.get(parent.id)! + 1 === ranks.get(node.id)
    ) {
      parents.set(node.id, parent.id);
      children.get(parent.id)!.push(node);
    }
  }
  const rankOrder = [...ordered].sort(
    (a, b) => ranks.get(a.id)! - ranks.get(b.id)!,
  );
  const roots = new Map<string, string>();
  const splitRoots = new Set<string>();
  for (const { id } of rankOrder) {
    const parent = parents.get(id);
    const root = parent ? roots.get(parent)! : id;
    roots.set(id, root);
    if (children.get(id)!.length > 1) splitRoots.add(root);
  }
  const treeHeights = new Map<string, number>();
  const childrenHeights = new Map<string, number>();
  const heightOf = (id: string) => nodeSizes.get(id)!.height;
  for (const { id } of rankOrder.reverse()) {
    const branches = children.get(id)!;
    const childHeight = branches.reduce(
      (height, child) => height + treeHeights.get(child.id)!,
      Math.max(0, branches.length - 1) * rowGap,
    );
    childrenHeights.set(id, childHeight);
    treeHeights.set(id, Math.max(heightOf(id), childHeight));
  }

  function arrangeBranches(contents: MoneyNode[]) {
    const rootNodes = contents.filter(({ id }) => !parents.has(id));
    const height = rootNodes.reduce(
      (sum, { id }) => sum + treeHeights.get(id)!,
      (rootNodes.length - 1) * rowGap,
    );
    let top = -height / 2;
    const queue = rootNodes.map((node) => {
      const branchTop = top;
      top += treeHeights.get(node.id)! + rowGap;
      return { node, top: branchTop };
    });
    const nodes: MoneyNode[] = [];
    for (let index = 0; index < queue.length; index++) {
      const { node, top } = queue[index];
      const center = top + treeHeights.get(node.id)! / 2;
      nodes.push({
        ...node,
        position: { x: columnX(node.id), y: center - heightOf(node.id) / 2 },
      });
      let childTop = center - childrenHeights.get(node.id)! / 2;
      for (const child of children.get(node.id)!) {
        queue.push({ node: child, top: childTop });
        childTop += treeHeights.get(child.id)! + rowGap;
      }
    }
    return nodes;
  }

  const looseRegions = new Map<string, MoneyNode[]>();
  for (const node of ungrouped) {
    const root = roots.get(node.id)!;
    const id = splitRoots.has(root) ? root : node.id;
    const region = looseRegions.get(id) ?? [];
    region.push(node);
    looseRegions.set(id, region);
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
  const groupBounds = new Map<string, Bounds>();
  const regions = [
    ...diagram.groups.map((group) => ({
      group,
      position: group.position,
      contents: members.get(group.id)!,
    })),
    ...Array.from(looseRegions, ([root, contents]) => ({
      group: undefined,
      position: byId.get(root)!.position,
      contents,
    })),
  ].sort(byPosition);
  for (const { group, contents } of regions) {
    if (!group && contents.length === 1) {
      const node = contents[0];
      const size = nodeSizes.get(node.id)!;
      const bounds = pack(
        { ...size, position: { x: columnX(node.id), y: -size.height / 2 } },
        [node.id],
      );
      positions.set(node.id, { ...bounds.position });
      continue;
    }
    const useBranches = contents.some(({ id }) =>
      splitRoots.has(roots.get(id)!),
    );
    const nodes = useBranches
      ? arrangeBranches(contents)
      : arrangeColumns(contents);
    const bounds = group
      ? nodes.length
        ? newGroupBounds(nodes, nodeSizes, { x: 0, y: 0 })
        : {
            position: { x: 0, y: -group.height / 2 },
            width: group.width,
            height: group.height,
          }
      : nodeBounds(nodes, nodeSizes);
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
    if (group) groupBounds.set(group.id, packed);
  }

  function arrangeColumns(contents: MoneyNode[]) {
    const columnHeights = new Map<number, number>();
    for (const node of contents) {
      const x = columnX(node.id);
      columnHeights.set(
        x,
        (columnHeights.get(x) ?? -rowGap) + heightOf(node.id) + rowGap,
      );
    }
    const nextRow = new Map<number, number>();
    return contents.map((node) => {
      const x = columnX(node.id);
      const y = nextRow.get(x) ?? -columnHeights.get(x)! / 2;
      nextRow.set(x, y + heightOf(node.id) + rowGap);
      return { ...node, position: { x, y } };
    });
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
