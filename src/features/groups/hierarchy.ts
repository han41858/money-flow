type GroupReference = { id: string; parentId?: string };

// Resolve ancestors iteratively, including when a saved diagram lists a
// child before its parent. A missing parent or cycle is invalid.
export function groupDepths(groups: readonly GroupReference[]) {
  const parents = new Map(groups.map(({ id, parentId }) => [id, parentId]));
  const depths = new Map<string, number>();
  for (const { id } of groups) {
    const chain = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !depths.has(current)) {
      if (!parents.has(current) || chain.has(current)) return undefined;
      chain.add(current);
      current = parents.get(current);
    }
    let depth = current === undefined ? -1 : depths.get(current)!;
    for (const group of [...chain].reverse()) depths.set(group, ++depth);
  }
  return depths;
}

export function groupsInLayerOrder<T extends GroupReference>(groups: T[]) {
  const depths = groupDepths(groups)!;
  return [...groups].sort((a, b) => depths.get(a.id)! - depths.get(b.id)!);
}
