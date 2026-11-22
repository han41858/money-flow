import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from 'idb';
import type { Diagram } from '../../types/diagram';
import { example } from '../../app/example';
import { blankDiagram, decodeDiagram } from './format';

interface Entry {
  id: string;
  revision: number;
  diagram: Diagram;
  fit: boolean;
}
export type Summary = Pick<Diagram, 'id' | 'name' | 'updatedAt'>;
interface LocalDB extends DBSchema {
  diagrams: { key: string; value: Entry };
  settings: { key: 'last'; value: string };
}
let connection: Promise<IDBPDatabase<LocalDB>> | undefined;
function db() {
  return (connection ??= openDB<LocalDB>('money-flow', 1, {
    upgrade(db) {
      db.createObjectStore('diagrams', { keyPath: 'id' });
      db.createObjectStore('settings');
    },
    blocking() {
      void connection?.then((db) => db.close());
      connection = undefined;
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  }));
}
type WriteTransaction = IDBPTransaction<
  LocalDB,
  ['diagrams', 'settings'],
  'readwrite'
>;
async function write<T>(work: (tx: WriteTransaction) => Promise<T>) {
  const tx = (await db()).transaction(['diagrams', 'settings'], 'readwrite');
  // Observe commit errors as well as request errors. A JS failure must also roll back earlier requests.
  const operation = work(tx).catch((error: unknown) => {
    try {
      tx.abort();
    } catch (abortError) {
      if (!(
        abortError instanceof DOMException &&
        abortError.name === 'InvalidStateError'
      ))
        throw abortError;
    }
    throw error;
  });
  const [value] = await Promise.all([operation, tx.done]);
  return value;
}
function entry(diagram: Diagram, fit = false): Entry {
  return { id: diagram.id, revision: 1, diagram, fit };
}
function checked(row: Entry) {
  const diagram = decodeDiagram(row.diagram);
  if (diagram.id !== row.id)
    throw new Error('저장된 다이어그램 ID가 일치하지 않습니다.');
  return { ...row, diagram };
}
export class Conflict extends Error {
  constructor(readonly revision: number | null) {
    super('다른 탭에서 다이어그램이 변경되었습니다.');
  }
}
export function restore() {
  return write(async (tx) => {
    const docs = tx.objectStore('diagrams'),
      settings = tx.objectStore('settings');
    const id = await settings.get('last');
    let row = id ? await docs.get(id) : undefined;
    row ??= (await docs.openCursor())?.value;
    const first = !row;
    if (!row) {
      row = entry(example, true);
      await docs.add(row);
    }
    const result = checked(row);
    await settings.put(row.id, 'last');
    return { row: result, first };
  });
}
export async function list(): Promise<Summary[]> {
  const rows = await (await db()).getAll('diagrams');
  return rows
    .map(({ id, diagram }) => ({
      id,
      name: typeof diagram?.name === 'string' ? diagram.name : '이름 없는 흐름',
      updatedAt:
        typeof diagram?.updatedAt === 'string' ? diagram.updatedAt : '',
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function revisionOf(id: string) {
  return (await (await db()).get('diagrams', id))?.revision ?? null;
}
export function openDiagram(id: string) {
  return write(async (tx) => {
    const row = await tx.objectStore('diagrams').get(id);
    if (!row) throw new Error('이미 삭제된 다이어그램입니다.');
    const result = checked(row);
    await tx.objectStore('settings').put(id, 'last');
    return result;
  });
}
export function insert(diagram: Diagram) {
  return write(async (tx) => {
    const row = entry(diagram);
    await tx.objectStore('diagrams').add(row);
    await tx.objectStore('settings').put(row.id, 'last');
    return row;
  });
}
export function save(diagram: Diagram, expected: number) {
  return write(async (tx) => {
    const docs = tx.objectStore('diagrams'),
      old = await docs.get(diagram.id);
    if (old?.revision !== expected) throw new Conflict(old?.revision ?? null);
    if (old.diagram.schemaVersion !== diagram.schemaVersion) checked(old);
    const next = { ...old, diagram, fit: false, revision: old.revision + 1 };
    await docs.put(next);
    await tx.objectStore('settings').put(diagram.id, 'last');
    return next.revision;
  });
}
export function removeDiagram(id: string, expected: number) {
  return write(async (tx) => {
    const docs = tx.objectStore('diagrams'),
      old = await docs.get(id);
    if (old?.revision !== expected) throw new Conflict(old?.revision ?? null);
    const keys = await docs.getAllKeys(),
      other = keys.find((k) => k !== id);
    const next = other
      ? checked((await docs.get(other))!)
      : entry(blankDiagram());
    if (!other) await docs.add(next);
    await docs.delete(id);
    await tx.objectStore('settings').put(next.id, 'last');
    return next;
  });
}
