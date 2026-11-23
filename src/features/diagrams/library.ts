import { create } from 'zustand';
import { editor } from '../editor/store';
import type { Diagram } from '../../types/diagram';
import * as db from '../../lib/storage/database';
import { downloadBlob } from '../../lib/download';
import {
  blankDiagram,
  copyDiagram,
  parseFile,
  serializeDiagram,
} from '../../lib/storage/format';

type View = Diagram['viewport'];
type LibraryState = {
  session: number;
  fit: boolean;
  entries: db.Summary[];
  busy: boolean;
  dirty: boolean;
  conflict: { revision: number | null } | null;
  error: string;
};
export const useLibrary = create<LibraryState>(() => ({
  session: 0,
  fit: false,
  entries: [],
  busy: false,
  dirty: false,
  conflict: null,
  error: '',
}));
const state = useLibrary.getState;
const update = useLibrary.setState;
let revision = 0;
let change = 0;
let view: View = editor.current().viewport;
let modifiedAt = editor.current().updatedAt;
let loading = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let channel: BroadcastChannel | undefined;
let queue = Promise.resolve();

function enqueue<T>(work: () => Promise<T>) {
  const next = queue.then(work);
  queue = next.then(
    () => {},
    () => {},
  );
  return next;
}

function report(error: unknown) {
  if (error instanceof db.Conflict) {
    update({ conflict: { revision: error.revision }, error: '' });
  } else {
    const message =
      error instanceof DOMException && error.name === 'QuotaExceededError'
        ? '브라우저 저장 공간이 부족합니다. JSON 파일로 백업하거나 공간을 확보한 뒤 다시 시도하세요.'
        : error instanceof Error
          ? error.message
          : '알 수 없는 오류';
    update({ error: '작업을 완료할 수 없습니다. ' + message });
  }
}

function changed() {
  if (!state().session || loading) return;
  modifiedAt = new Date().toISOString();
  change++;
  update({ dirty: true });
  clearTimeout(timer);
  if (!state().conflict) timer = setTimeout(saveSoon, 250);
}

function saveSoon() {
  clearTimeout(timer);
  if (state().dirty && !state().conflict) void enqueue(flush).catch(report);
}

export function snapshot(): Diagram {
  return { ...editor.current(), updatedAt: modifiedAt, viewport: { ...view } };
}

function advertise(id: string) {
  channel?.postMessage(id);
}

async function refresh() {
  update({ entries: await db.list() });
}

async function flush() {
  const { dirty, conflict } = state();
  if (conflict) throw new db.Conflict(conflict.revision);
  if (!dirty) return;
  const tick = change;
  const diagram = snapshot();
  revision = await db.save(diagram, revision);
  if (tick === change) update({ dirty: false, error: '' });
  advertise(diagram.id);
  update((s) => ({
    entries: [
      { id: diagram.id, name: diagram.name, updatedAt: diagram.updatedAt },
      ...s.entries.filter((d) => d.id !== diagram.id),
    ],
  }));
}

function activate(row: Awaited<ReturnType<typeof db.openDiagram>>) {
  clearTimeout(timer);
  revision = row.revision;
  view = row.diagram.viewport;
  modifiedAt = row.diagram.updatedAt;
  loading = true;
  try {
    editor.load(row.diagram);
  } finally {
    loading = false;
  }
  update({
    session: state().session + 1,
    dirty: false,
    fit: row.fit,
    conflict: null,
    error: '',
  });
}

async function checkRemote(id?: string) {
  if (!state().session) return;
  const active = editor.current().id;
  if (!id || active === id) {
    const actual = await db.revisionOf(active);
    if (actual !== revision) {
      clearTimeout(timer);
      update({ conflict: { revision: actual } });
    }
  }
  await refresh();
}

async function action(work: () => Promise<void>) {
  if (state().busy) return false;
  update({ busy: true, error: '' });
  try {
    await enqueue(work);
    return true;
  } catch (e) {
    report(e);
    return false;
  } finally {
    update({ busy: false });
  }
}

let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  editor.useDiagram.subscribe(changed);
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('money-flow-diagrams');
    channel.onmessage = (e) => {
      if (typeof e.data === 'string')
        void enqueue(() => checkRemote(e.data)).catch(report);
    };
  }
  window.addEventListener(
    'focus',
    () => void enqueue(() => checkRemote()).catch(report),
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveSoon();
    else void enqueue(() => checkRemote()).catch(report);
  });
  window.addEventListener('pagehide', saveSoon);
  window.addEventListener('beforeunload', (e) => {
    if (state().dirty) {
      saveSoon();
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

let initialDiagram = blankDiagram;

export async function start(initial: () => Diagram) {
  initialDiagram = initial;
  if (state().session) return true;
  listen();
  return action(async () => {
    await refresh();
    const { row, first } = await db.restore(initialDiagram);
    activate(row);
    if (first) {
      await refresh();
      if (navigator.storage?.persist)
        void navigator.storage.persist().catch(() => {});
    }
  });
}

export function recordViewport(id: string, next: View, userInitiated: boolean) {
  if (
    id !== editor.current().id ||
    (view.x === next.x && view.y === next.y && view.zoom === next.zoom)
  )
    return;
  view = next;
  if (userInitiated || state().dirty) changed();
}

export function open(id: string) {
  return action(async () => {
    await flush();
    activate(await db.openDiagram(id));
  });
}

async function createFrom(diagram: Diagram) {
  activate(await db.insert(diagram));
  advertise(diagram.id);
  await refresh();
}

export function createBlank() {
  return action(async () => {
    await flush();
    await createFrom(blankDiagram());
  });
}

export function copyShared(diagram: Diagram) {
  listen();
  return action(async () => {
    await flush();
    await createFrom(copyDiagram(diagram, diagram.name + ' 복사본'));
  });
}

export function duplicate() {
  return action(async () => {
    await flush();
    await createFrom(
      copyDiagram(snapshot(), editor.current().name + ' 복사본'),
    );
  });
}

export function importFile(file: File) {
  return action(async () => {
    const diagram = parseFile(await file.text());
    await flush();
    await createFrom(copyDiagram(diagram));
  });
}

export function rename(name: string) {
  return action(async () => {
    if (!name.trim()) throw new Error('다이어그램 이름을 입력하세요.');
    if (state().conflict) throw new db.Conflict(state().conflict!.revision);
    editor.rename(name);
    await flush();
  });
}

export function remove() {
  return action(async () => {
    await flush();
    const id = editor.current().id;
    activate(await db.removeDiagram(id, revision));
    advertise(id);
    await refresh();
  });
}

export function reloadLatest() {
  return action(async () => {
    const id = editor.current().id;
    activate(
      (await db.revisionOf(id)) === null
        ? (await db.restore(initialDiagram)).row
        : await db.openDiagram(id),
    );
    await refresh();
  });
}

export function keepLocal(conflict: NonNullable<LibraryState['conflict']>) {
  return action(async () => {
    if (conflict.revision === null) {
      await createFrom(copyDiagram(snapshot()));
      return;
    }
    // Acknowledge only the displayed revision. A newer concurrent write triggers another conflict.
    revision = conflict.revision;
    update({ conflict: null, dirty: true });
    await flush();
  });
}

export function retrySave() {
  return action(async () => {
    await flush();
    await refresh();
  });
}

export function exportFile() {
  try {
    const diagram = snapshot();
    downloadBlob(
      new Blob([serializeDiagram(diagram)], { type: 'application/json' }),
      diagram.name + '.json',
    );
  } catch (e) {
    report(e);
  }
}
