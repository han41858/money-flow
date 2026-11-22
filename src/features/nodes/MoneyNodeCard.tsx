import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
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
  return ids.map((id, i) => (
    <Handle
      key={id}
      id={id}
      type={outgoing ? 'source' : 'target'}
      position={outgoing ? Position.Right : Position.Left}
      isConnectable={false}
      style={{ top: ((i + 1) / (ids.length + 1)) * 100 + '%' }}
    />
  ));
}

export function MoneyNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const {
    node,
    appearance: { Icon, subtitle, color },
  } = data;
  return (
    <div
      className={'money-node' + (selected ? ' active' : '')}
      style={
        { '--accent': color, '--outline': strokeColor(color) } as CSSProperties
      }
    >
      <Ports ids={data.inputs} />
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
      <Ports ids={data.outputs} outgoing />
    </div>
  );
}
