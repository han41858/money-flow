import type { MoneyEdge } from '../../types/diagram';
import { portSize } from '../nodes/sizing';
import { labelBlocker, transferGeometry, type Box } from './geometry';
import { amountLabel, edgeWidth } from './money';

type Point = { x: number; y: number };

export type TransferRouteInput = {
  edge: MoneyEdge;
  sourceCard: Box;
  targetCard: Box;
  sourcePort: number;
  targetPort: number;
  targetPortCount: number;
  obstacles: Box[];
};

export function transferRoute(
  {
    edge,
    sourceCard,
    targetCard,
    sourcePort,
    targetPort,
    targetPortCount,
    obstacles,
  }: TransferRouteInput,
  handles?: { source: Point; target: Point },
) {
  // React Flow reports the outer handles as nodes move. For static scenes,
  // derive the same connection points directly from the card rectangles.
  const source = handles
    ? { x: handles.source.x - portSize, y: handles.source.y }
    : {
        x: sourceCard.x + sourceCard.width,
        y: sourceCard.y + sourceCard.height / 2,
      };
  const target = handles
    ? { x: handles.target.x + portSize, y: handles.target.y }
    : { x: targetCard.x, y: targetCard.y + targetCard.height / 2 };
  const label = amountLabel(edge.min, edge.max);
  const stroke = edgeWidth(edge);
  return {
    label,
    stroke,
    geometry: transferGeometry(
      source.x,
      source.y + (sourcePort - 0.5) * sourceCard.height,
      target.x,
      target.y + (targetPort - 0.5) * targetCard.height,
      stroke,
      targetPortCount,
      labelBlocker(label, obstacles),
    ),
  };
}
