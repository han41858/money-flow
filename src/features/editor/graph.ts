import { MarkerType, type Node, type Edge } from '@xyflow/react';
import { strokeColor } from '../../lib/brands/palette';
import type { Diagram, MoneyEdge, MoneyNode } from '../../types/diagram';
import { describe } from '../nodes/presentation';
export type FlowNode = Node<
  {
    node: MoneyNode;
    appearance: ReturnType<typeof describe>;
    inputs: string[];
    outputs: string[];
  },
  'money'
>;
export type FlowEdge = Edge<{ edge: MoneyEdge; color: string }, 'transfer'>;

export function buildGraph(diagram: Diagram) {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  function sortedPorts(node: MoneyNode, outgoing: boolean) {
    const end = outgoing ? 'source' : 'target',
      other = outgoing ? 'target' : 'source';
    return diagram.edges
      .filter((e) => e[end] === node.id)
      .sort(
        (a, b) =>
          byId.get(a[other])!.position.y - byId.get(b[other])!.position.y,
      )
      .map((e) => e.id);
  }
  const nodes: FlowNode[] = diagram.nodes.map((node) => ({
    id: node.id,
    type: 'money',
    position: node.position,
    ariaLabel: node.name,
    data: {
      node,
      appearance: describe(node, diagram),
      inputs: sortedPorts(node, false),
      outputs: sortedPorts(node, true),
    },
  }));
  const edges: FlowEdge[] = diagram.edges.map((edge) => {
    const color = strokeColor(describe(byId.get(edge.source)!, diagram).color);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.id,
      targetHandle: edge.id,
      type: 'transfer',
      data: { edge, color },
      ariaLabel:
        byId.get(edge.source)!.name + ' → ' + byId.get(edge.target)!.name,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        markerUnits: 'userSpaceOnUse',
        width: 15,
        height: 15,
      },
    };
  });
  return { nodes, edges };
}
