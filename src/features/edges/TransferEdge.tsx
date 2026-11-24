import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { nodeHeight, portSize } from '../nodes/sizing';
import { transferGeometry } from './geometry';
import type { FlowEdge } from '../editor/graph';
import { edgeWidth, exactAmount } from './money';
import { TransferAmount } from './TransferAmount';

export const TransferEdge = memo(function TransferEdge({
  id,
  data,
  selected,
  ...coords
}: EdgeProps<FlowEdge>) {
  if (!data) return null;
  const { color, edge } = data;
  const stroke = edgeWidth(edge);
  const { path, shaft, arrow, x, y } = transferGeometry(
    // The visible handles sit outside the card; established edges use its sides.
    coords.sourceX - portSize,
    coords.sourceY + (data.sourcePort - 0.5) * nodeHeight,
    coords.targetX + portSize,
    coords.targetY + (data.targetPort - 0.5) * nodeHeight,
    stroke,
    data.targetPortCount,
  );
  const title = exactAmount(edge);
  return (
    <>
      <title>{title}</title>
      <BaseEdge id={id} path={path} style={{ stroke: 'transparent' }} />
      <path
        className="transfer-shaft"
        d={shaft}
        fill={color}
        stroke={selected ? '#20392d' : 'none'}
        strokeWidth={selected ? 4 : undefined}
        paintOrder="stroke fill"
        strokeLinejoin="round"
        pointerEvents="none"
      />
      <path
        className="transfer-arrow"
        d={arrow}
        fill={color}
        pointerEvents="none"
      />
      <EdgeLabelRenderer>
        <TransferAmount
          edge={edge}
          readOnly={data.readOnly}
          style={{
            transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          }}
        />
      </EdgeLabelRenderer>
    </>
  );
});
