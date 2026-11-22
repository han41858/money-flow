import { type Node, type Edge } from '@xyflow/react';
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
    readOnly?: boolean;
  },
  'money'
>;
export type FlowEdge = Edge<
  { edge: MoneyEdge; color: string; targetPortCount: number },
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

  function sortedPorts(node: MoneyNode, outgoing: boolean) {
    const end = outgoing ? 'source' : 'target';
    const other = outgoing ? 'target' : 'source';
    return diagram.edges
      .filter((e) => e[end] === node.id)
      .sort(
        (a, b) =>
          byId.get(a[other])!.position.y - byId.get(b[other])!.position.y,
      )
      .map((e) => e.id);
  }

  const nodes: FlowNode[] = diagram.nodes.map((node) => {
    const parent = node.groupId ? byGroupId.get(node.groupId) : undefined;
    return {
      id: node.id,
      type: 'money',
      position: parent
        ? relativeTo(node.position, parent.position)
        : node.position,
      parentId: parent?.id,
      ariaLabel: node.name,
      zIndex: 2,
      data: {
        node,
        appearance: describe(node, diagram),
        inputs: sortedPorts(node, false),
        outputs: sortedPorts(node, true),
      },
    };
  });
  const inputCounts = new Map(nodes.map((n) => [n.id, n.data.inputs.length]));
  const edges: FlowEdge[] = diagram.edges.map((edge) => {
    const color = strokeColor(describe(byId.get(edge.source)!, diagram).color);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.id,
      targetHandle: edge.id,
      type: 'transfer',
      data: { edge, color, targetPortCount: inputCounts.get(edge.target)! },
      ariaLabel:
        byId.get(edge.source)!.name + ' → ' + byId.get(edge.target)!.name,
    };
  });
  return { nodes, edges, groupNodes };
}
