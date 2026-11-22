import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { defaultNodeSize } from '../groups/geometry';
import { transferGeometry } from './geometry';
import type { FlowEdge } from '../editor/graph';
import { amountLabel, edgeWidth, exactAmount } from './money';

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
    coords.sourceY + (data.sourcePort - 0.5) * defaultNodeSize.height,
    coords.targetX,
    coords.targetY + (data.targetPort - 0.5) * defaultNodeSize.height,
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
        <span
          className="edge-label nodrag nopan"
          title={title}
          style={{
            transform:
              'translate(-50%, -50%) translate(' + x + 'px, ' + y + 'px)',
          }}
        >
          {amountLabel(edge.min, edge.max)}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
