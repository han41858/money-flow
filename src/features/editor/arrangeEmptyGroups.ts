import type { Diagram, MoneyNode } from '../../types/diagram';
import {
  enclosingBounds,
  paddedGroupBounds,
  nodeBounds,
  type Group,
  type NodeSizes,
} from '../groups/geometry';

type Position = MoneyNode['position'];
type Bounds = Pick<Group, 'position' | 'width' | 'height'>;

export function byPosition(
  a: Pick<MoneyNode, 'position'>,
  b: Pick<MoneyNode, 'position'>,
) {
  return a.position.y - b.position.y || a.position.x - b.position.x;
}

export function appendEmptyGroups(
  groups: Group[],
  deepestFirst: Group[],
  layout: Pick<Diagram, 'nodes' | 'groups'>,
  sizes: NodeSizes,
  { columnGap, regionGap }: { columnGap: number; regionGap: number },
) {
  type Occupied = { box: Bounds; original: Bounds; groupId?: string };
  type Scope = { occupied: Occupied[]; empty: Group[] };
  const scopes = new Map<string | undefined, Scope>();
  const bounds = new Map<string, Bounds>(
    layout.groups.map((group) => [group.id, group]),
  );
  const shifted = new Map<string, number>();

  function scopeFor(id: string | undefined) {
    const scope = scopes.get(id) ?? { occupied: [], empty: [] };
    scopes.set(id, scope);
    return scope;
  }

  for (const node of layout.nodes) {
    const parent =
      node.groupId && bounds.has(node.groupId) ? node.groupId : undefined;
    const box = nodeBounds([node], sizes);
    node.position = box.position;
    scopeFor(parent).occupied.push({
      box,
      original: { ...box, position: { ...box.position } },
    });
  }

  function separate(scope: Scope) {
    const items = [...scope.occupied].sort(
      (a, b) => a.original.position.x - b.original.position.x,
    );
    const right = (box: Bounds) => box.position.x + box.width;
    const sharesRows = (a: Bounds, b: Bounds) =>
      a.position.y < b.position.y + b.height &&
      b.position.y < a.position.y + a.height;
    for (const [index, item] of items.entries()) {
      const start = item.box.position.x;
      let x = start;
      for (const left of items.slice(0, index)) {
        if (!sharesRows(left.box, item.box)) continue;
        const originalGap = item.original.position.x - right(left.original);
        if (originalGap < 0 && sharesRows(left.original, item.original))
          continue;
        const gap = Math.max(0, Math.min(originalGap, columnGap));
        x = Math.max(x, right(left.box) + gap);
      }
      item.box.position.x = x;
      if (item.groupId && x > start) shifted.set(item.groupId, x - start);
    }
  }

  function placeColumn({ occupied, empty }: Scope, origin: Position) {
    const boxes = occupied.map(({ box }) => box);
    if (!empty.length) return boxes;
    const content = boxes.length ? enclosingBounds(boxes) : undefined;
    const x = content
      ? content.position.x + content.width + columnGap
      : origin.x;
    let y = content?.position.y ?? origin.y;
    for (const { id } of empty.sort(byPosition)) {
      const { width, height } = bounds.get(id)!;
      const placed = { position: { x, y }, width, height };
      bounds.set(id, placed);
      boxes.push(placed);
      y += height + regionGap;
    }
    return boxes;
  }

  // Resolve collisions in each scope before growing its parent. Horizontal
  // offsets stay local to the scope until the top-down pass.
  for (const group of deepestFirst) {
    const scope = scopeFor(group.id);
    const parent = scopeFor(group.parentId);
    const current = bounds.get(group.id);
    if (current) {
      separate(scope);
      const children = placeColumn(scope, current.position);
      const expanded = enclosingBounds([
        current,
        paddedGroupBounds(enclosingBounds(children)),
      ]);
      bounds.set(group.id, expanded);
      parent.occupied.push({
        box: expanded,
        original: current,
        groupId: group.id,
      });
    } else {
      const children = placeColumn(scope, { x: 0, y: 0 });
      const size = children.length
        ? paddedGroupBounds(enclosingBounds(children))
        : group;
      for (const { position } of children) {
        position.x -= size.position.x;
        position.y -= size.position.y;
      }
      bounds.set(group.id, {
        position: { x: 0, y: 0 },
        width: size.width,
        height: size.height,
      });
      parent.empty.push(group);
    }
  }
  const root = scopeFor(undefined);
  separate(root);
  placeColumn(root, enclosingBounds(groups).position);

  // Only children of empty groups were placed in parent-local coordinates.
  const populated = new Set(layout.groups.map(({ id }) => id));
  for (const { id, parentId } of [...deepestFirst].reverse()) {
    if (!parentId) continue;
    const { position } = bounds.get(id)!;
    if (populated.has(parentId)) {
      const offset = shifted.get(parentId) ?? 0;
      position.x += offset;
      shifted.set(id, (shifted.get(id) ?? 0) + offset);
    } else {
      const { position: parent } = bounds.get(parentId)!;
      position.x += parent.x;
      position.y += parent.y;
    }
  }
  for (const node of layout.nodes) {
    if (node.groupId) node.position.x += shifted.get(node.groupId) ?? 0;
  }

  return {
    nodes: layout.nodes,
    groups: groups.map((group) => ({ ...group, ...bounds.get(group.id)! })),
  };
}
