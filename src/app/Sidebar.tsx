import {
  ChevronRight,
  ClipboardPaste,
  Frame,
  Layers2,
  ListTree,
  Plus,
  X,
} from 'lucide-react';
import type { Diagram } from '../types/diagram';
import { useLibrary } from '../features/diagrams/library';
import type { Kind, Selection } from '../features/editor/store';
import { describe, kindIcons, kindNames } from '../features/nodes/presentation';

type Panel = 'tools' | 'details' | null;

export function Sidebar({
  diagram,
  mobile,
  setMobile,
  clipboard,
  add,
  addGroup,
  pasteNodes,
  select,
}: {
  diagram: Diagram;
  mobile: Panel;
  setMobile: (panel: Panel) => void;
  clipboard: unknown;
  add: (kind: Kind) => void;
  addGroup: () => void;
  pasteNodes: () => void;
  select: (s: Selection) => void;
}) {
  const { nodes, edges } = diagram;
  const { dirty, conflict, error } = useLibrary();
  return (
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
            </button>
          );
        })}
      </div>
      <button className="add-region" onClick={addGroup}>
        <Frame size={15} />
        그룹 추가
        <Plus size={13} />
      </button>
      <button
        className="paste-nodes"
        disabled={!clipboard}
        onClick={pasteNodes}
        title="붙여넣기 (Ctrl/⌘ V)"
      >
        <ClipboardPaste size={15} /> 노드 붙여넣기
      </button>
      <div className="side-content">
        <div className="side-head">
          <span>
            <ListTree size={16} />
            노드 목록
          </span>
        </div>
        <div className="sidebar-summary">
          <p>
            노드 {nodes.length}개 · 연결 {edges.length}개
          </p>
          <p role="status">
            {conflict
              ? '자동 저장 일시 중지'
              : dirty
                ? error
                  ? '저장되지 않은 변경 사항'
                  : '저장 중…'
                : '이 브라우저에 저장됨'}
          </p>
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
                            'color-mix(in srgb, ' + color + ' 12%, white)',
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
                onClick={() => select({ groups: [g.id], nodes: [], edges: [] })}
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
  );
}
