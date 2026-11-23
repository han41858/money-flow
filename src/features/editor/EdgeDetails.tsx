import type { Diagram, MoneyEdge } from '../../types/diagram';
import { exactAmount } from '../edges/money';
import { editor, type Selection } from './store';
import { TextField, AmountFields } from './fields';

export function EdgeDetails({
  edge,
  nodes,
  select,
}: {
  edge: MoneyEdge;
  nodes: Diagram['nodes'];
  select: (s: Selection) => void;
}) {
  return (
    <>
      <p className="edge-route">
        <button
          className="text-button"
          onClick={() =>
            select({ groups: [], nodes: [edge.source], edges: [] })
          }
        >
          {nodes.find((n) => n.id === edge.source)?.name}
        </button>{' '}
        →{' '}
        <button
          className="text-button"
          onClick={() =>
            select({ groups: [], nodes: [edge.target], edges: [] })
          }
        >
          {nodes.find((n) => n.id === edge.target)?.name}
        </button>
      </p>
      <div className="property">
        <span>월 이체액</span>
        <strong>{exactAmount(edge)}</strong>
      </div>
      <AmountFields key={edge.min + '-' + edge.max} edge={edge} />
      <TextField
        key={edge.memo ?? ''}
        label="명목 및 메모"
        value={edge.memo ?? ''}
        commit={(memo) => {
          editor.editEdge(edge.id, { memo: memo || undefined });
        }}
      />
    </>
  );
}
