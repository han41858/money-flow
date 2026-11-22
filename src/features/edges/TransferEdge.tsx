import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import type { FlowEdge } from '../editor/graph';
import { amountLabel, edgeWidth, exactAmount } from './money';

export function TransferEdge({
  id,
  data,
  selected,
  markerEnd,
  ...coords
}: EdgeProps<FlowEdge>) {
  if (!data) return null;
  const [path, x, y] = getBezierPath(coords);
  const { color, edge } = data;
  const title = exactAmount(edge);
  return (
    <>
      <title>{title}</title>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: edgeWidth(edge),
          opacity: selected ? 1 : 0.52,
        }}
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
