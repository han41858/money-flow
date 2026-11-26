import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { transferRoute } from './route';
import type { FlowEdge } from '../editor/graph';
import { exactAmount } from './money';
import { TransferAmount } from './TransferAmount';

export const TransferEdge = memo(function TransferEdge({
  id,
  data,
  selected,
  ...coords
}: EdgeProps<FlowEdge>) {
  if (!data) return null;
  const { color, edge } = data;
  const {
    stroke,
    geometry: { path, body, shaft, arrow, x, y },
  } = transferRoute(data, {
    source: { x: coords.sourceX, y: coords.sourceY },
    target: { x: coords.targetX, y: coords.targetY },
  });
  const title = exactAmount(edge);
  return (
    <>
      <title>{title}</title>
      <BaseEdge id={id} path={path} style={{ stroke: 'transparent' }} />
      <EdgeLabelRenderer>
        {/* Keep the edge hit target in React Flow's native layer under the nodes. */}
        <svg
          className="transfer-visual"
          data-edge-id={id}
          data-selected={selected || undefined}
          aria-hidden="true"
        >
          {selected && (
            <g stroke="#1d263c" pointerEvents="none">
              <path d={body} fill="none" strokeWidth={stroke + 4} />
              <path
                d={shaft}
                fill="none"
                strokeWidth={4}
                strokeLinejoin="round"
              />
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
        </svg>
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
