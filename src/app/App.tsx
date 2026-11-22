import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useStore } from 'zustand';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Frame,
  FilePlus2,
  FolderOpen,
  Layers2,
  ListTree,
  Network,
  PanelLeftOpen,
  Plus,
  Redo2,
  Sprout,
  Undo2,
  Waypoints,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ResponsivePanel } from './ResponsivePanel';
import { ShareDialog } from '../features/sharing/ShareDialog';
import { Share2 } from 'lucide-react';
import { Canvas } from '../features/editor/Canvas';
import { Inspector } from '../features/editor/Inspector';
import {
  editor,
  emptySelection,
  type Kind,
  type Selection,
} from '../features/editor/store';
import { insertionPoint } from '../features/editor/placement';
import { amountLabel, sum } from '../features/edges/money';
import { describe, kindNames, kindIcons } from '../features/nodes/presentation';

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

function Summary({
  icon: Icon,
  label,
  value,
  theme,
}: {
  icon: LucideIcon;
  label: string;
  value: { min: number; max: number };
  theme: string;
}) {
  return (
    <div className={'metric ' + theme}>
      <span className="metric-icon">
        <Icon size={21} />
      </span>
      <div>
        <span>{label}</span>
        <strong>
          {amountLabel(value.min, value.max)}
          <small>원</small>
        </strong>
      </div>
    </div>
  );
}
function Workspace() {
  const diagram = editor.useDiagram((s) => s.diagram),
    { nodes, edges } = diagram;
  const [shareOpen, setShareOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { dirty, busy, conflict, error } = useLibrary();
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
  const undoable = useStore(editor.history, (s) => s.pastStates.length > 0),
    redoable = useStore(editor.history, (s) => s.futureStates.length > 0);
  const remove = useCallback(() => {
    editor.remove(selection);
    setSelected(emptySelection);
    setMobile(null);
  }, [selection]);
  const close = () => {
    setSelected(emptySelection);
    setMobile(null);
  };
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        libraryOpen ||
        shareOpen ||
        useLibrary.getState().busy ||
        e.defaultPrevented ||
        e.isComposing ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            e.target.closest('input,textarea,select,[role=textbox]')))
      )
        return;
      const mod = e.ctrlKey || e.metaKey,
        key = e.key.toLowerCase();
      if (mod && (key === 'z' || key === 'y')) {
        e.preventDefault();
        const h = editor.history.getState();
        if (key === 'y' || e.shiftKey) h.redo();
        else h.undo();
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        remove();
      } else if (key === 'escape') {
        setSelected(emptySelection);
        setMobile(null);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [remove, libraryOpen, shareOpen]);
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
    const point = insertionPoint(
      kind,
      nodes,
      screenToFlowPosition({ x: box.left, y: box.top }),
      screenToFlowPosition({ x: box.right, y: box.bottom }),
      diagram.groups,
    );
    const id = editor.addNode(kind, point);
    select({ groups: [], nodes: [id], edges: [] });
    requestAnimationFrame(() => {
      const area = document
        .querySelector('.flow-area')!
        .getBoundingClientRect();
      const top = flowToScreenPosition(point);
      const viewport = getViewport();
      const dx = Math.min(0, area.right - 10 - top.x - 185 * viewport.zoom);
      const dy = Math.min(0, area.bottom - 10 - top.y - 105 * viewport.zoom);
      if (dx || dy)
        void setViewport({
          ...viewport,
          x: viewport.x + dx,
          y: viewport.y + dy,
        });
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  function expense(category: 'consumption' | 'saving') {
    return sum(
      edges.filter((e) => {
        const n = byId.get(e.target);
        return n?.type === 'expense' && n.category === category;
      }),
    );
  }
  return (
    <div className="workspace" inert={busy}>
      <a className="skip-link" href="#editor-main">
        캔버스로 건너뛰기
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Waypoints size={23} />
          </span>
          Money Flow
        </div>
        <span className="header-divider" />
        <span className="workspace-title">워크스페이스</span>
        <div className="history-tools">
          <button
            aria-label="실행 취소"
            title="실행 취소 (Ctrl/⌘ Z)"
            disabled={!undoable}
            onClick={() => editor.history.getState().undo()}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="다시 실행"
            title="다시 실행 (Ctrl/⌘ Shift Z)"
            disabled={!redoable}
            onClick={() => editor.history.getState().redo()}
          >
            <Redo2 size={17} />
          </button>
          <button
            className="fresh share-trigger"
            aria-label="공유 및 내보내기"
            title="공유 및 내보내기"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={15} />
            <span>공유</span>
          </button>
          <button className="fresh" onClick={() => setLibraryOpen(true)}>
            <FolderOpen size={15} />내 흐름
          </button>
          <button className="fresh" onClick={() => void createBlank()}>
            <FilePlus2 size={15} />새 흐름
          </button>
        </div>
      </header>
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
          <aside
            className={'sidebar' + (mobile === 'tools' ? ' open' : '')}
            aria-label="다이어그램 탐색"
          >
            <div className="side-head">
              <span>
                <Layers2 size={16} />
                편집 도구
              </span>
              <button
                className="mobile-only"
                aria-label="탐색 닫기"
                onClick={() => setMobile(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="add-tools">
              {(Object.keys(kindNames) as Kind[]).map((type) => {
                const Icon = kindIcons[type];
                return (
                  <button
                    key={type}
                    onClick={() => add(type)}
                    aria-label={kindNames[type] + ' 추가'}
                  >
                    <Icon size={16} />
                    {kindNames[type]}
                    <Plus size={13} />
                  </button>
                );
              })}
            </div>
            <button className="add-region" onClick={addGroup}>
              <Frame size={15} />
              그룹 추가
              <Plus size={13} />
            </button>
            <div className="side-content">
              <div className="side-head">
                <span>
                  <ListTree size={16} />
                  노드 목록
                </span>
                <b>{nodes.length}</b>
              </div>
              {(Object.keys(kindNames) as Kind[])
                .filter((type) => nodes.some((n) => n.type === type))
                .map((type) => (
                  <section key={type} className="node-group">
                    <h3>{kindNames[type]}</h3>
                    {nodes
                      .filter((n) => n.type === type)
                      .map((n) => {
                        const { Icon, color } = describe(n, diagram);
                        return (
                          <button
                            className="node-row"
                            key={n.id}
                            onClick={() =>
                              select({ groups: [], nodes: [n.id], edges: [] })
                            }
                          >
                            <span
                              style={{
                                background:
                                  'color-mix(in srgb, ' +
                                  color +
                                  ' 12%, white)',
                              }}
                            >
                              <Icon size={14} />
                            </span>
                            {n.name}
                            <ChevronRight size={13} />
                          </button>
                        );
                      })}
                  </section>
                ))}
              {diagram.groups.length > 0 && (
                <section className="node-group">
                  <h3>그룹</h3>
                  {diagram.groups.map((g) => (
                    <button
                      className="node-row"
                      key={g.id}
                      onClick={() =>
                        select({ groups: [g.id], nodes: [], edges: [] })
                      }
                    >
                      <span style={{ background: g.color + '33' }}>
                        <Frame size={14} />
                      </span>
                      {g.name}
                      <ChevronRight size={13} />
                    </button>
                  ))}
                </section>
              )}
            </div>
          </aside>
        </ResponsivePanel>
        <main id="editor-main" tabIndex={-1}>
          <div className="page-head">
            <div className="breadcrumb">
              <Network size={14} />
              다이어그램 <ChevronRight size={13} />
              <span>월간 계획</span>
            </div>
            <div className="title-row">
              <h1>{diagram.name}</h1>
              <button
                className="mobile-only"
                aria-label="노드 목록 열기"
                onClick={() => setMobile('tools')}
              >
                <PanelLeftOpen />
              </button>
            </div>
            <p>
              노드의 연결점을 끌거나 출발 노드의 속성에서 연결할 노드를
              선택하세요.
            </p>
          </div>
          <div className="metrics">
            <Summary
              icon={ArrowDownLeft}
              theme="income"
              label="월 수입"
              value={sum(
                edges.filter((e) => byId.get(e.source)?.type === 'income'),
              )}
            />
            <Summary
              icon={ArrowUpRight}
              theme="spend"
              label="월 소비 지출"
              value={expense('consumption')}
            />
            <Summary
              icon={Sprout}
              theme="save"
              label="월 저축·투자"
              value={expense('saving')}
            />
          </div>
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
                    close={close}
                  />
                </div>
              </ResponsivePanel>
            )}
          </div>
          <footer>
            <span>
              <Activity size={14} />
              노드 {nodes.length}개 <i /> 연결 {edges.length}개
            </span>
            <span role="status">
              {conflict
                ? '자동 저장 일시 중지'
                : dirty
                  ? error
                    ? '저장되지 않은 변경 사항'
                    : '저장 중…'
                  : '이 브라우저에 저장됨'}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export function App() {
  const session = useLibrary((s) => s.session),
    error = useLibrary((s) => s.error),
    entries = useLibrary((s) => s.entries);
  if (!session)
    return (
      <main className="library-start" aria-live="polite">
        <h1>Money Flow</h1>
        {error ? (
          <>
            <p>{error}</p>
            <button onClick={() => void start()}>다시 열기</button>
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
      <Workspace />
    </ReactFlowProvider>
  );
}
