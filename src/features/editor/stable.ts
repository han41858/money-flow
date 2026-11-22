import { useRef } from 'react';

type Item = { id: string; data?: object };
type Snapshot<T> = { list: T[]; byId: Map<string, T> };

function shallowEqual(a: object | undefined, b: object | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return keys.every(
    (key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]),
  );
}

// Returns the previous object for every item whose fields (and `data` fields)
// are unchanged, and the previous list itself when nothing changed at all.
export function reuseUnchanged<T extends Item>(
  previous: Snapshot<T>,
  items: T[],
): Snapshot<T> {
  const byId = new Map<string, T>();
  const list = items.map((item) => {
    const old = previous.byId.get(item.id);
    let stable = item;
    if (old) {
      const candidate = shallowEqual(old.data, item.data)
        ? { ...item, data: old.data }
        : item;
      stable = shallowEqual(old, candidate) ? old : candidate;
    }
    byId.set(item.id, stable);
    return stable;
  });
  const unchanged =
    list.length === previous.list.length &&
    list.every((item, index) => item === previous.list[index]);
  return unchanged ? previous : { list, byId };
}

// React Flow re-renders a node or edge whenever it receives a new object for
// it. Reusing unchanged objects keeps a drag from re-rendering everything.
export function useStableItems<T extends Item>(items: T[]): T[] {
  const previous = useRef<Snapshot<T>>({ list: [], byId: new Map() });
  previous.current = reuseUnchanged(previous.current, items);
  return previous.current.list;
}
