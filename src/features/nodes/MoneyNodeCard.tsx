import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { strokeColor } from '../../lib/brands/palette';
import type { FlowNode } from '../editor/graph';
import { kindNames } from './presentation';

function Ports({
  ids,
  outgoing = false,
}: {
  ids: string[];
  outgoing?: boolean;
}) {
  const ports = ids.length ? ids : [outgoing ? 'new-out' : 'new-in'];
  return ports.map((id, i) => (
    <Handle
      key={id}
      id={id}
      type={outgoing ? 'source' : 'target'}
      position={outgoing ? Position.Right : Position.Left}
      isConnectableStart={outgoing}
      isConnectableEnd={!outgoing}
      style={{ top: ((i + 1) / (ports.length + 1)) * 100 + '%' }}
    />
  ));
}

export function MoneyNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const {
    node,
    appearance: { Icon, subtitle, color },
  } = data;
  const update = useUpdateNodeInternals();
  const layout = JSON.stringify([node.type, data.inputs, data.outputs]);
  const lastLayout = useRef(layout);
  useLayoutEffect(() => {
    if (lastLayout.current === layout) return;
    lastLayout.current = layout;
    update(node.id);
  }, [node.id, layout, update]);
  return (
    <div
      className={'money-node' + (selected ? ' active' : '')}
      style={
        { '--accent': color, '--outline': strokeColor(color) } as CSSProperties
      }
    >
      {node.type !== 'income' && <Ports ids={data.inputs} />}
      <div className="node-meta">
        <span className="node-icon">
          {node.type === 'card' ? (
            <span aria-label="카드">💳</span>
          ) : (
            <Icon size={18} />
          )}
        </span>
        <span>{kindNames[node.type]}</span>
      </div>
      <strong>{node.name}</strong>
      <small>{subtitle}</small>
      {node.type !== 'expense' && <Ports ids={data.outputs} outgoing />}
    </div>
  );
}
