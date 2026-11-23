import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { PanelLeftOpen } from 'lucide-react';
import { example } from './example';
import { Metrics } from './Metrics';
import { ResponsivePanel } from './ResponsivePanel';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useShortcuts } from './useShortcuts';
import { ShareDialog } from '../features/sharing/ShareDialog';
import { Canvas } from '../features/editor/Canvas';
import { Inspector } from '../features/editor/Inspector';
import {
  editor,
  emptySelection,
  type Kind,
  type NodeClipboard,
  type Selection,
} from '../features/editor/store';
import { browserTextWidth, cardSize } from '../features/nodes/sizing';
import { insertionPoint } from '../features/editor/placement';
import { newNodeName } from '../features/nodes/presentation';

import {
  LibraryDialog,
  StorageNotice,
} from '../features/diagrams/LibraryDialog';
import {
  useLibrary,
  createBlank,
  start,
  open as openDiagram,
} from '../features/diagrams/library';

import { measuredSizes, newGroupBounds } from '../features/groups/geometry';

function Workspace({
  clipboard,
  setClipboard,
}: {
  clipboard: NodeClipboard | null;
  setClipboard: (value: NodeClipboard) => void;
}) {
  const diagram = editor.useDiagram((s) => s.diagram);
  const { nodes, edges } = diagram;
  const [shareOpen, setShareOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { busy } = useLibrary();
  const [selection, setSelected] = useState<Selection>(emptySelection);
  const selected = {
    groups: selection.groups.filter((id) =>
      diagram.groups.some((g) => g.id === id),
    ),
    nodes: selection.nodes.filter((id) => nodes.some((n) => n.id === id)),
    edges: selection.edges.filter((id) => edges.some((e) => e.id === id)),
  };
  const count =
    selected.nodes.length + selected.edges.length + selected.groups.length;
  const [mobile, setMobile] = useState<'tools' | 'details' | null>(null);
  const {
    getInternalNode,
    screenToFlowPosition,
    flowToScreenPosition,
    getViewport,
    setViewport,
  } = useReactFlow();
  const remove = useCallback(() => {
    editor.remove(selection);
    setSelected(emptySelection);
    setMobile(null);
  }, [selection]);
  const close = () => {
    setSelected(emptySelection);
    setMobile(null);
  };
  const copyNodes = useCallback(() => {
    const copied = editor.copyNodes(selection.nodes);
    if (!copied) return false;
    setClipboard(copied);
    return true;
  }, [selection.nodes, setClipboard]);
  const pasteNodes = useCallback(() => {
    if (!clipboard) return false;
    const canvas = document
      .querySelector('.flow-area')!
      .getBoundingClientRect();
    const center = screenToFlowPosition({
      x: canvas.left + canvas.width / 2,
      y: canvas.top + canvas.height / 2,
    });
    const ids = editor.pasteNodes(clipboard, center, browserTextWidth);
    setSelected({ ...emptySelection, nodes: ids });
    setMobile(null);
    return true;
  }, [clipboard, screenToFlowPosition]);

  const clear = useCallback(() => {
    setSelected(emptySelection);
    setMobile(null);
  }, []);
  useShortcuts({
    blocked: libraryOpen || shareOpen,
    copyNodes,
    pasteNodes,
    remove,
    clear,
  });
  const select = (s: Selection) => {
    setSelected(s);
    setMobile('details');
  };

  function addGroup() {
    const area = document.querySelector('.flow-area')!.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: area.left + area.width / 2,
      y: area.top + area.height / 2,
    });
    const sizes = measuredSizes(nodes, getInternalNode);
    const bounds = newGroupBounds(
      nodes.filter((n) => selected.nodes.includes(n.id)),
      sizes,
      center,
    );
    const id = editor.addGroup(bounds, sizes);
    select({ nodes: [], edges: [], groups: [id] });
  }

  function add(kind: Kind) {
    const box = document.querySelector('.flow-area')!.getBoundingClientRect();
    const size = cardSize(newNodeName(kind), browserTextWidth);
    const point = insertionPoint(
      kind,
      nodes,
      screenToFlowPosition({ x: box.left, y: box.top }),
      screenToFlowPosition({ x: box.right, y: box.bottom }),
      diagram.groups,
      size,
      measuredSizes(nodes, getInternalNode),
    );
    const id = editor.addNode(kind, point);
    select({ groups: [], nodes: [id], edges: [] });
    requestAnimationFrame(() => {
      const area = document
        .querySelector('.flow-area')!
        .getBoundingClientRect();
      const top = flowToScreenPosition(point);
      const viewport = getViewport();
      const dx = Math.min(
        0,
        area.right - 10 - top.x - size.width * viewport.zoom,
      );
      const dy = Math.min(
        0,
        area.bottom - 10 - top.y - size.height * viewport.zoom,
      );
      if (dx || dy)
        void setViewport({
          ...viewport,
          x: viewport.x + dx,
          y: viewport.y + dy,
        });
    });
  }

  return (
    <div className="workspace" inert={busy}>
      <a className="skip-link" href="#editor-main">
        캔버스로 건너뛰기
      </a>
      <Topbar
        diagram={diagram}
        setShareOpen={setShareOpen}
        setLibraryOpen={setLibraryOpen}
      />
      {shareOpen && <ShareDialog close={() => setShareOpen(false)} />}
      {libraryOpen ? (
        <LibraryDialog close={() => setLibraryOpen(false)} />
      ) : (
        <StorageNotice />
      )}
      <div className="workspace-body">
        <ResponsivePanel
          open={mobile === 'tools'}
          side="left"
          label="편집 도구"
          close={() => setMobile(null)}
        >
          <Sidebar
            diagram={diagram}
            mobile={mobile}
            setMobile={setMobile}
            clipboard={clipboard}
            add={add}
            addGroup={addGroup}
            pasteNodes={pasteNodes}
            select={select}
          />
        </ResponsivePanel>
        <main id="editor-main" tabIndex={-1} aria-label={diagram.name}>
          <button
            className="mobile-only node-list-toggle"
            aria-label="노드 목록 열기"
            onClick={() => setMobile('tools')}
          >
            <PanelLeftOpen size={17} />
          </button>
          <Metrics diagram={diagram} />
          <div className="editor-area">
            <Canvas
              key={diagram.id}
              diagram={diagram}
              selected={selected}
              setSelected={setSelected}
              openInspector={() => setMobile('details')}
            />
            {count > 0 && (
              <ResponsivePanel
                open={mobile === 'details'}
                side="right"
                label="선택한 객체 속성"
                close={close}
              >
                <div
                  className={
                    'detail-wrap' + (mobile === 'details' ? ' open' : '')
                  }
                >
                  <Inspector
                    key={JSON.stringify(selected)}
                    diagram={diagram}
                    selected={selected}
                    select={select}
                    remove={remove}
                    copy={copyNodes}
                    close={close}
                  />
                </div>
              </ResponsivePanel>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

const initialDiagram = () => example;

export function App() {
  const [clipboard, setClipboard] = useState<NodeClipboard | null>(null);
  useEffect(() => {
    void start(initialDiagram);
  }, []);
  const session = useLibrary((s) => s.session);
  const error = useLibrary((s) => s.error);
  const entries = useLibrary((s) => s.entries);
  if (!session)
    return (
      <main className="library-start" aria-live="polite">
        <h1>Money Flow</h1>
        {error ? (
          <>
            <p>{error}</p>
            <button onClick={() => void start(initialDiagram)}>
              다시 열기
            </button>
            {entries.length > 0 && (
              <div>
                <h2>저장된 흐름 열기</h2>
                <button onClick={() => void createBlank()}>새 흐름</button>
                {entries.map((d) => (
                  <button key={d.id} onClick={() => void openDiagram(d.id)}>
                    {d.name}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p>저장된 흐름을 여는 중…</p>
        )}
      </main>
    );
  return (
    <ReactFlowProvider key={session}>
      <Workspace clipboard={clipboard} setClipboard={setClipboard} />
    </ReactFlowProvider>
  );
}
