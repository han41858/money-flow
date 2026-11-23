import { useState } from 'react';
import { Copy, Trash2, X } from 'lucide-react';
import type { Diagram } from '../../types/diagram';
import { EdgeDetails } from './EdgeDetails';
import { GroupDetails } from './GroupDetails';
import { NodeDetails } from './NodeDetails';
import type { Selection } from './store';

type Props = {
  diagram: Diagram;
  selected: Selection;
  select: (s: Selection) => void;
  close: () => void;
  remove: () => void;
  copy: () => void;
};

export function Inspector({
  diagram,
  selected,
  select,
  close,
  remove,
  copy,
}: Props) {
  const [error, setError] = useState('');
  const { nodes, edges } = diagram;
  const count =
    selected.nodes.length + selected.edges.length + selected.groups.length;
  const group =
    count === 1
      ? diagram.groups.find((g) => selected.groups.includes(g.id))
      : undefined;
  const node =
    count === 1 ? nodes.find((n) => selected.nodes.includes(n.id)) : undefined;
  const edge =
    count === 1 ? edges.find((e) => selected.edges.includes(e.id)) : undefined;
  return (
    <aside className="inspector" aria-label="속성 패널">
      <div className="inspector-head">
        <span>속성</span>
        <button aria-label="속성 닫기" onClick={close}>
          <X size={17} />
        </button>
      </div>
      <h2>
        {group?.name ??
          node?.name ??
          (edge ? '연결선 상세' : count + '개 객체 선택')}
      </h2>
      {group && <GroupDetails group={group} nodes={nodes} />}
      {node && (
        <NodeDetails
          node={node}
          diagram={diagram}
          select={select}
          error={error}
          setError={setError}
        />
      )}
      {edge && <EdgeDetails edge={edge} nodes={nodes} select={select} />}
      {selected.nodes.length > 0 && (
        <button className="copy-nodes" onClick={copy} title="복사 (Ctrl/⌘ C)">
          <Copy size={15} /> 선택 노드 복사
        </button>
      )}
      <button className="delete-objects" onClick={remove}>
        <Trash2 size={15} />
        선택 삭제
      </button>
    </aside>
  );
}
