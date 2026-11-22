import { type Node, type Edge } from '@xyflow/react';
import { amountLabel, exactAmount, sum } from '../edges/money';
import { portFraction } from '../edges/geometry';
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
    totals: { label: string; description: string }[];
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
    const totals = [
      { direction: '들어온 합계', edges: inputs },
      { direction: '나간 합계', edges: outputs },
    ].flatMap(({ direction, edges }) => {
      if (edges.length < 2) return [];
      const total = sum(edges);
      return [
        {
          label: direction + ' ' + amountLabel(total.min, total.max),
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
  const edges: FlowEdge[] = diagram.edges.map((edge) => {
    const color = strokeColor(describe(byId.get(edge.source)!, diagram).color);
    const outputs = byNodeId.get(edge.source)!.outputs;
    const inputs = byNodeId.get(edge.target)!.inputs;
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
      },
      ariaLabel:
        byId.get(edge.source)!.name + ' → ' + byId.get(edge.target)!.name,
    };
  });
  return { nodes, edges, groupNodes };
}
