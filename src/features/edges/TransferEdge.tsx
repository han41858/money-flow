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
  const { path, body, shaft, arrow, x, y } = transferGeometry(
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
      {selected && (
        <g stroke="#20392d" pointerEvents="none">
          <path d={body} fill="none" strokeWidth={stroke + 4} />
          <path d={shaft} fill="none" strokeWidth={4} strokeLinejoin="round" />
        </g>
      )}
      <path
        className="transfer-body"
        d={body}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        pointerEvents="none"
      />
      <path
        className="transfer-shaft"
        d={shaft}
        fill={color}
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
