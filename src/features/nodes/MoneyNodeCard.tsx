import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import { strokeColor } from '../../lib/brands/palette';
import type { FlowNode } from '../editor/graph';
import { NodeArtwork, browserTextWidth, cardLayout } from './artwork';
import { defaultNodeSize } from '../groups/geometry';
import { portFraction } from '../edges/geometry';

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
      style={{ top: portFraction(i, ports.length) * 100 + '%' }}
    />
  ));
}

export function MoneyNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const { node, appearance } = data;
  const gradientId = useId();
  const width = defaultNodeSize.width;
  const card = useMemo(
    () => cardLayout(data, width, browserTextWidth),
    [data, width],
  );
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
      style={{ '--outline': strokeColor(appearance.color) } as CSSProperties}
    >
      {node.type !== 'income' && <Ports ids={data.inputs} />}
      <NodeArtwork
        decorative
        data={data}
        layout={card}
        size={{ width, height: card.height }}
        gradientId={gradientId}
      />
      {node.type !== 'expense' && <Ports ids={data.outputs} outgoing />}
    </div>
  );
}
