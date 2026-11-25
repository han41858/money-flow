import type { Diagram, MoneyNode } from '../../types/diagram';
import {
  enclosingBounds,
  paddedGroupBounds,
  nodeBounds,
  type Group,
  type NodeSizes,
  type Size,
} from '../groups/geometry';
import { groupsInLayerOrder } from '../groups/hierarchy';
import { amountLabel } from '../edges/money';
import { cardSize, estimatedTextWidth } from '../nodes/sizing';

const columnGap = 64;
// Matches the `.edge-label` font size and its horizontal padding plus the
// clearance that keeps the label off both cards.
const labelFontSize = 13;
const labelClearance = 24;
const rowGap = 24;
const regionGap = 24;

type Position = MoneyNode['position'];
type Bounds = Pick<Group, 'position' | 'width' | 'height'>;
type Region = Bounds & { nodeIds: string[]; descendantPositions: Position[] };
type Metrics = {
  columnX: (id: string) => number;
  heightOf: (id: string) => number;
};

function byPosition(
  a: Pick<MoneyNode, 'position'>,
  b: Pick<MoneyNode, 'position'>,
) {
  return a.position.y - b.position.y || a.position.x - b.position.x;
}

function countLinks(diagram: Diagram, ordered: MoneyNode[]) {
  const outgoing = new Map(ordered.map((n) => [n.id, [] as string[]]));
  const indegree = new Map(ordered.map((n) => [n.id, 0]));
  const soleParent = new Map<string, string>();
  for (const { source, target } of diagram.edges) {
    outgoing.get(source)!.push(target);
    const count = indegree.get(target)! + 1;
    indegree.set(target, count);
    if (count === 1) soleParent.set(target, source);
    else soleParent.delete(target);
  }
  return { outgoing, indegree, soleParent };
}

// Assigns each node the column after its furthest upstream node.
// Consumes `indegree`: the counts reach zero as nodes are placed.
function rankNodes(
  diagram: Diagram,
  ordered: MoneyNode[],
  outgoing: Map<string, string[]>,
  indegree: Map<string, number>,
) {
  const ranks = new Map(ordered.map((n) => [n.id, 0]));
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
  return ranks;
}

// Use forward links within each group. Merge points and cycle back-edges
// remain independent so no node belongs to multiple branches.
function buildBranches(
  ordered: MoneyNode[],
  soleParent: Map<string, string>,
  ranks: Map<string, number>,
  heightOf: (id: string) => number,
) {
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
  for (const { id } of rankOrder.reverse()) {
    const branches = children.get(id)!;
    const childHeight = branches.reduce(
      (height, child) => height + treeHeights.get(child.id)!,
      Math.max(0, branches.length - 1) * rowGap,
    );
    childrenHeights.set(id, childHeight);
    treeHeights.set(id, Math.max(heightOf(id), childHeight));
  }
  return {
    byId,
    parents,
    children,
    roots,
    splitRoots,
    treeHeights,
    childrenHeights,
  };
}

type Branches = ReturnType<typeof buildBranches>;

// Centers each parent on its subtree and stacks sibling subtrees below it.
function arrangeBranches(
  contents: MoneyNode[],
  { parents, children, treeHeights, childrenHeights }: Branches,
  { columnX, heightOf }: Metrics,
) {
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

// Stacks the nodes of each column and centers every column vertically.
function arrangeColumns(contents: MoneyNode[], { columnX, heightOf }: Metrics) {
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

// Places regions top to bottom, below any earlier region they would overlap.
function createPacker() {
  const placed: Region[] = [];
  function pack(
    bounds: Bounds,
    nodeIds: string[] = [],
    descendantPositions: Position[] = [],
  ) {
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
    placed.push({ ...result, nodeIds, descendantPositions });
    return result;
  }
  return { placed, pack };
}

// Recenter vertical stacks together so moving them cannot introduce overlaps.
// A placed region shares its `position` object with the bounds returned by
// `pack`, so moving the region also moves the group that was packed.
function recenterBands(
  placed: Region[],
  positions: Map<string, Position>,
  heightOf: (id: string) => number,
) {
  const bands: Region[][] = [];
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
    for (const region of band) {
      region.position.y -= offset;
      for (const position of region.descendantPositions) position.y -= offset;
    }
    for (const id of ids) positions.get(id)!.y -= offset;
  }
}

type GroupLayout = {
  bounds: Bounds;
  nodes: MoneyNode[];
  children: { id: string; offsetY: number }[];
};

function arrangeGroups(
  groups: Group[],
  members: Map<string, MoneyNode[]>,
  arrangeNodes: (contents: MoneyNode[]) => MoneyNode[],
  sizes: NodeSizes,
) {
  const children = new Map(groups.map(({ id }) => [id, [] as Group[]]));
  for (const group of groups)
    if (group.parentId) children.get(group.parentId)!.push(group);

  const layouts = new Map<string, GroupLayout>();
  for (const group of groupsInLayerOrder(groups).reverse()) {
    const contents = members.get(group.id)!;
    const nodes = arrangeNodes(contents);
    const nested = children.get(group.id)!;
    if (!nested.length) {
      const bounds = nodes.length
        ? paddedGroupBounds(nodeBounds(nodes, sizes))
        : {
            position: { x: 0, y: -group.height / 2 },
            width: group.width,
            height: group.height,
          };
      layouts.set(group.id, { bounds, nodes, children: [] });
      continue;
    }
    const regions: { id?: string; position: Position; bounds: Bounds }[] =
      nested.map(({ id, position }) => ({
        id,
        position,
        bounds: layouts.get(id)!.bounds,
      }));
    if (nodes.length)
      regions.push({
        position: contents[0].position,
        bounds: nodeBounds(nodes, sizes),
      });
    const { placed, pack } = createPacker();
    const childLayouts: GroupLayout['children'] = [];
    for (const { id, bounds } of regions.sort(byPosition)) {
      const offsetY = pack(bounds).position.y - bounds.position.y;
      if (id) childLayouts.push({ id, offsetY });
      else for (const node of nodes) node.position.y += offsetY;
    }
    layouts.set(group.id, {
      bounds: paddedGroupBounds(enclosingBounds(placed)),
      nodes,
      children: childLayouts,
    });
  }
  return layouts;
}

export function arrangeDiagram(diagram: Diagram, sizes: NodeSizes) {
  const ordered = [...diagram.nodes].sort(byPosition);
  const { outgoing, indegree, soleParent } = countLinks(diagram, ordered);
  const nodeSizes = new Map<string, Size>(
    ordered.map((node) => [node.id, sizes.get(node.id) ?? cardSize(node.name)]),
  );
  const ranks = rankNodes(diagram, ordered, outgoing, indegree);

  const columnWidth = ordered.reduce(
    (width, n) => Math.max(width, nodeSizes.get(n.id)!.width),
    0,
  );
  // Widen only the gaps that hold a longer amount label. A label sits between
  // the cards it connects, so only links to the next column count.
  const gaps: number[] = [];
  for (const { source, target, min, max } of diagram.edges) {
    const rank = ranks.get(source)!;
    if (ranks.get(target) !== rank + 1) continue;
    gaps[rank] = Math.max(
      gaps[rank] ?? columnGap,
      Math.ceil(estimatedTextWidth(amountLabel(min, max), labelFontSize)) +
        labelClearance,
    );
  }
  const columns = [0];
  for (const rank of ranks.values())
    for (let next = columns.length; next <= rank; next++)
      columns[next] =
        columns[next - 1] + columnWidth + (gaps[next - 1] ?? columnGap);
  const metrics: Metrics = {
    columnX: (id) => columns[ranks.get(id)!],
    heightOf: (id) => nodeSizes.get(id)!.height,
  };
  const members = new Map(diagram.groups.map((g) => [g.id, [] as MoneyNode[]]));
  const ungrouped: MoneyNode[] = [];
  for (const node of ordered) {
    const group = node.groupId && members.get(node.groupId);
    (group || ungrouped).push(node);
  }

  const branches = buildBranches(ordered, soleParent, ranks, metrics.heightOf);
  const { byId, roots, splitRoots } = branches;
  const looseRegions = new Map<string, MoneyNode[]>();
  for (const node of ungrouped) {
    const root = roots.get(node.id)!;
    const id = splitRoots.has(root) ? root : node.id;
    const region = looseRegions.get(id) ?? [];
    region.push(node);
    looseRegions.set(id, region);
  }

  function arrangeNodes(contents: MoneyNode[]) {
    const useBranches = contents.some(({ id }) =>
      splitRoots.has(roots.get(id)!),
    );
    return useBranches
      ? arrangeBranches(contents, branches, metrics)
      : arrangeColumns(contents, metrics);
  }

  const groupLayouts = arrangeGroups(
    diagram.groups,
    members,
    arrangeNodes,
    nodeSizes,
  );
  const { placed, pack } = createPacker();
  const positions = new Map<string, Position>();
  const groupBounds = new Map<string, Bounds>();
  const regions = [
    ...diagram.groups
      .filter((group) => !group.parentId)
      .map((group) => ({
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
    if (group) {
      const layout = groupLayouts.get(group.id)!;
      const nodeIds: string[] = [];
      const descendantPositions: Position[] = [];
      const packed = pack(layout.bounds, nodeIds, descendantPositions);
      groupBounds.set(group.id, packed);
      const stack = [
        { layout, offsetY: packed.position.y - layout.bounds.position.y },
      ];
      while (stack.length) {
        const next = stack.pop()!;
        for (const { id, position } of next.layout.nodes) {
          positions.set(id, { x: position.x, y: position.y + next.offsetY });
          nodeIds.push(id);
        }
        for (const child of next.layout.children) {
          const childLayout = groupLayouts.get(child.id)!;
          const { bounds } = childLayout;
          const offsetY = next.offsetY + child.offsetY;
          const position = {
            x: bounds.position.x,
            y: bounds.position.y + offsetY,
          };
          descendantPositions.push(position);
          groupBounds.set(child.id, { ...bounds, position });
          stack.push({ layout: childLayout, offsetY });
        }
      }
      continue;
    }
    if (contents.length === 1) {
      const node = contents[0];
      const size = nodeSizes.get(node.id)!;
      const bounds = pack(
        {
          ...size,
          position: { x: metrics.columnX(node.id), y: -size.height / 2 },
        },
        [node.id],
      );
      positions.set(node.id, { ...bounds.position });
      continue;
    }
    const nodes = arrangeNodes(contents);
    const bounds = nodeBounds(nodes, nodeSizes);
    const packed = pack(
      bounds,
      contents.map((node) => node.id),
    );
    for (const { id, position } of nodes)
      positions.set(id, {
        x: position.x,
        y: position.y + packed.position.y - bounds.position.y,
      });
  }

  recenterBands(placed, positions, metrics.heightOf);

  // Packing uses a local origin. Keep the arranged diagram anchored to the
  // former top-left so the unchanged viewport still shows the user's work.
  const oldOrigin = { x: Infinity, y: Infinity };
  for (const { position } of [...diagram.nodes, ...diagram.groups]) {
    oldOrigin.x = Math.min(oldOrigin.x, position.x);
    oldOrigin.y = Math.min(oldOrigin.y, position.y);
  }
  const newOrigin = { x: Infinity, y: Infinity };
  for (const { position } of placed) {
    newOrigin.x = Math.min(newOrigin.x, position.x);
    newOrigin.y = Math.min(newOrigin.y, position.y);
  }
  const anchored = (position: Position): Position => ({
    x: oldOrigin.x + (position.x - newOrigin.x),
    y: oldOrigin.y + (position.y - newOrigin.y),
  });

  const nodes = diagram.nodes.map((node) => ({
    ...node,
    position: anchored(positions.get(node.id)!),
  }));
  const groups = diagram.groups.map((group) => {
    const bounds = groupBounds.get(group.id)!;
    return { ...group, ...bounds, position: anchored(bounds.position) };
  });
  return { nodes, groups };
}
