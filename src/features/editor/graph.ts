import type { NodeTotal } from '../nodes/sizing';
import { type Node, type Edge } from '@xyflow/react';
import { amountLabel, exactAmount, sum } from '../edges/money';
import { portFraction, type Box } from '../edges/geometry';
import { cardSize } from '../nodes/sizing';
import { strokeColor } from '../../lib/brands/palette';
import type { Diagram, MoneyEdge, MoneyNode } from '../../types/diagram';
import { describe } from '../nodes/presentation';
import { relativeTo } from '../groups/geometry';
import type { RegionNode } from '../groups/GroupRegion';
export type FlowNode = Node<
  {
    node: MoneyNode;
    appearance: ReturnType<typeof describe>;
    inputs: string[];
    outputs: string[];
    totals: NodeTotal[];
    readOnly?: boolean;
  },
  'money'
>;
export type FlowEdge = Edge<
  {
    edge: MoneyEdge;
    color: string;
    sourcePort: number;
    targetPort: number;
    targetPortCount: number;
    // Cards between the two ends that the amount label must not cover.
    obstacles: Box[];
    readOnly?: boolean;
  },
  'transfer'
>;

export function buildGraph(diagram: Diagram) {
  let prefix = 'group:';
  while (diagram.nodes.some((n) => n.id.startsWith(prefix))) prefix += ':';
  const groupNodes: RegionNode[] = diagram.groups.map((group) => ({
    id: prefix + group.id,
    type: 'region',
    position: group.position,
    width: group.width,
    height: group.height,
    data: { group },
    ariaLabel: group.name,
    connectable: false,
    dragHandle: '.group-title',
    zIndex: -1,
  }));
  const byGroupId = new Map(groupNodes.map((n) => [n.data.group.id, n]));
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));

  const incoming = new Map(
    diagram.nodes.map(({ id }) => [id, [] as MoneyEdge[]]),
  );
  const outgoing = new Map(
    diagram.nodes.map(({ id }) => [id, [] as MoneyEdge[]]),
  );
  for (const edge of diagram.edges) {
    incoming.get(edge.target)!.push(edge);
    outgoing.get(edge.source)!.push(edge);
  }

  function sortedPorts(edges: MoneyEdge[], other: 'source' | 'target') {
    return edges
      .sort(
        (a, b) =>
          byId.get(a[other])!.position.y - byId.get(b[other])!.position.y,
      )
      .map((edge) => edge.id);
  }

  const nodes: FlowNode[] = diagram.nodes.map((node) => {
    const parent = node.groupId ? byGroupId.get(node.groupId) : undefined;
    const inputs = incoming.get(node.id)!;
    const outputs = outgoing.get(node.id)!;
    const directions = [
      { direction: '들어온 합계', edges: inputs, side: 'left' },
      { direction: '나간 합계', edges: outputs, side: 'right' },
    ] as const;
    const totals = directions.flatMap(({ direction, edges, side }) => {
      if (edges.length < 2) return [];
      const total = sum(edges);
      return [
        {
          side,
          label: amountLabel(total.min, total.max),
          description: direction + ' ' + exactAmount(total),
        },
      ];
    });
    return {
      id: node.id,
      type: 'money',
      position: parent
        ? relativeTo(node.position, parent.position)
        : node.position,
      parentId: parent?.id,
      ariaLabel: node.name,
      domAttributes: {
        'aria-description':
          totals.map(({ description }) => description).join(', ') || undefined,
      },
      zIndex: 2,
      data: {
        node,
        appearance: describe(node, diagram),
        inputs: sortedPorts(inputs, 'source'),
        outputs: sortedPorts(outputs, 'target'),
        totals,
      },
    };
  });
  const byNodeId = new Map(nodes.map((n) => [n.id, n.data]));
  const cards = diagram.nodes.map((node) => ({
    id: node.id,
    ...node.position,
    ...cardSize(node.name),
  }));
  const edges: FlowEdge[] = diagram.edges.map((edge) => {
    const color = strokeColor(describe(byId.get(edge.source)!, diagram).color);
    const outputs = byNodeId.get(edge.source)!.outputs;
    const inputs = byNodeId.get(edge.target)!.inputs;
    const source = byId.get(edge.source)!;
    const from = source.position.x + cardSize(source.name).width;
    const to = byId.get(edge.target)!.position.x;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'transfer',
      data: {
        edge,
        color,
        sourcePort: portFraction(outputs.indexOf(edge.id), outputs.length),
        targetPort: portFraction(inputs.indexOf(edge.id), inputs.length),
        targetPortCount: inputs.length,
        obstacles: cards
          .filter(
            (card) =>
              card.id !== edge.source &&
              card.id !== edge.target &&
              card.x + card.width > from &&
              card.x < to,
          )
          .map(({ x, y, width, height }) => ({ x, y, width, height })),
      },
      ariaLabel:
        byId.get(edge.source)!.name + ' → ' + byId.get(edge.target)!.name,
    };
  });
  return { nodes, edges, groupNodes };
}
