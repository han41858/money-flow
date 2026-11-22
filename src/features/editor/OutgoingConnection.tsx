import { useState } from 'react';
import type { Diagram, MoneyNode } from '../../types/diagram';
import { canConnect } from '../edges/connections';
import { editor } from './store';

export function OutgoingConnection({
  diagram,
  source,
  selectEdge,
}: {
  diagram: Diagram;
  source: MoneyNode;
  selectEdge: (id: string) => void;
}) {
  const [targetId, setTargetId] = useState('');
  if (source.type === 'expense') return null;
  const targets = diagram.nodes.filter((n) =>
    canConnect(diagram, source.id, n.id),
  );
  if (!targets.length) return null;
  const target = targets.some((n) => n.id === targetId)
    ? targetId
    : targets[0].id;
  return (
    <form
      className="outgoing"
      onSubmit={(e) => {
        e.preventDefault();
        const id = editor.connect(source.id, target);
        if (id) selectEdge(id);
      }}
    >
      <label className="field">
        연결할 노드
        <select value={target} onChange={(e) => setTargetId(e.target.value)}>
          {targets.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">연결 추가</button>
    </form>
  );
}
