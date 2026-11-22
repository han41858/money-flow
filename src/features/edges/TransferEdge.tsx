import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { nodeHeight } from '../nodes/sizing';
import { transferGeometry } from './geometry';
import type { FlowEdge } from '../editor/graph';
import { edgeWidth, exactAmount } from './money';
import { TransferAmount } from './TransferAmount';

export function TransferEdge({
  id,
  data,
  selected,
  ...coords
}: EdgeProps<FlowEdge>) {
  if (!data) return null;
  const { color, edge } = data;
  const stroke = edgeWidth(edge);
  const { path, arrow, x, y } = transferGeometry(
    coords.sourceX,
    coords.sourceY + (data.sourcePort - 0.5) * nodeHeight,
    coords.targetX,
    coords.targetY + (data.targetPort - 0.5) * nodeHeight,
    stroke,
    data.targetPortCount,
  );
  const title = exactAmount(edge);
  return (
    <>
      <title>{title}</title>
      {selected && (
        <path
          d={path}
          fill="none"
          stroke="#20392d"
          strokeWidth={stroke + 4}
          pointerEvents="none"
          aria-hidden="true"
        />
      )}
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: stroke,
        }}
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
}
