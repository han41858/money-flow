import type { Diagram } from '../../types/diagram';
import { amountLabelBox, type Box } from '../edges/geometry';
import { transferRoute } from '../edges/route';
import { rectsOverlap, type NodeSizes } from '../groups/geometry';
import {
  estimatedTextWidth,
  layoutTotals,
  totalLineHeight,
} from '../nodes/sizing';
import { buildGraph } from './graph';

type Transfer = {
  label: Box;
  geometry: ReturnType<typeof transferRoute>['geometry'];
  stroke: number;
};

function touchesOtherTransfer(label: Box, { geometry, stroke }: Transfer) {
  if (rectsOverlap(label, geometry.arrowBounds, 2, 2)) return true;
  const margin = stroke / 2;
  const { centerline } = geometry;
  let from = centerline[0].point;
  const end = centerline.at(-1)!.point;
  const envelope = {
    x: from.x - margin,
    y: Math.min(from.y, end.y) - margin,
    width: end.x - from.x + stroke,
    height: Math.abs(end.y - from.y) + stroke,
  };
  if (!rectsOverlap(label, envelope)) return false;
  for (let index = 1; index < centerline.length; index++) {
    const { point: to } = centerline[index];
    const segment = {
      x: Math.min(from.x, to.x) - margin,
      y: Math.min(from.y, to.y) - margin,
      width: Math.abs(from.x - to.x) + stroke,
      height: Math.abs(from.y - to.y) + stroke,
    };
    if (rectsOverlap(label, segment)) return true;
    from = to;
  }
  return false;
}

export function amountConflicts(
  diagram: Diagram,
  sizes: NodeSizes,
  ranks: ReadonlyMap<string, number>,
) {
  const columns = new Map<number, Set<string>>();
  for (const { id, source, target } of diagram.edges) {
    const rank = ranks.get(source)!;
    if (ranks.get(target) !== rank + 1) continue;
    const ids = columns.get(rank) ?? new Set<string>();
    ids.add(id);
    columns.set(rank, ids);
  }
  const crowded = [...columns].filter(([, ids]) => ids.size > 1);
  if (!crowded.length) return new Map<number, number>();

  const graph = buildGraph(diagram, estimatedTextWidth, sizes);
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const totals = graph.nodes.flatMap(({ id, data }) => {
    const { x, y, width, height } = graph.cards.get(id)!;
    return layoutTotals(data.totals, width, estimatedTextWidth).map(
      (total) => ({
        x: x + total.x - (total.side === 'right' ? total.labelWidth : 0),
        y: y + height,
        width: total.labelWidth,
        height: totalLineHeight,
      }),
    );
  });
  const labelObstacles = [...graph.cards.values(), ...totals];
  return new Map(
    crowded.map(([rank, ids]) => {
      const transfers: Transfer[] = [];
      for (const id of ids) {
        const { data } = edges.get(id)!;
        if (!data) continue;
        const { label, stroke, geometry } = transferRoute(data);
        transfers.push({
          label: amountLabelBox(label, geometry),
          stroke,
          geometry,
        });
      }
      let count = 0;
      for (const transfer of transfers) {
        const { label } = transfer;
        if (labelObstacles.some((box) => rectsOverlap(label, box))) count++;
        for (const other of transfers) {
          if (other === transfer) continue;
          if (
            rectsOverlap(label, other.label, 2, 2) ||
            touchesOtherTransfer(label, other)
          )
            count++;
        }
      }
      return [rank, count];
    }),
  );
}
