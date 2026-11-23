import { useState } from 'react';

type Item = { id: string; data?: object };
type Snapshot<T> = { list: T[]; byId: Map<string, T> };

function isPlain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Structural equality for the plain objects and arrays that make up a node or
// edge. Anything else (functions, components, class instances) is compared by
// identity.
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameValue(value, b[index]))
    );
  if (!isPlain(a) || !isPlain(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
  );
}

// Returns the previous object for every item whose value is unchanged, the
// previous `data` when only other fields changed, and the previous snapshot
// itself when nothing changed at all.
export function reuseUnchanged<T extends Item>(
  previous: Snapshot<T>,
  items: T[],
): Snapshot<T> {
  const byId = new Map<string, T>();
  const list = items.map((item) => {
    const old = previous.byId.get(item.id);
    let stable = item;
    if (old && sameValue(old, item)) stable = old;
    else if (old && sameValue(old.data, item.data))
      stable = { ...item, data: old.data };
    byId.set(item.id, stable);
    return stable;
  });
  const unchanged =
    list.length === previous.list.length &&
    list.every((item, index) => item === previous.list[index]);
  return unchanged ? previous : { list, byId };
}

// React Flow re-renders a node or edge whenever it receives a new object for
// it. Reusing unchanged objects keeps a drag or a single edit from
// re-rendering everything. The snapshot lives in state and is replaced during
// render, which React supports for values derived from the previous render.
export function useStableItems<T extends Item>(items: T[]): T[] {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({
    list: [],
    byId: new Map(),
  });
  const next = reuseUnchanged(snapshot, items);
  if (next !== snapshot) setSnapshot(next);
  return next.list;
}
