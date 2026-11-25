import { deflateRawSync } from 'node:zlib';
import type { Diagram } from '../src/types/diagram';

// Freeze the previous writer here so v2 comparisons do not use v3 code.
export function compactV2(diagram: Diagram) {
  const shortIds = (items: { id: string }[]) =>
    new Map(items.map((item, index) => [item.id, index.toString(36)]));
  const nodes = shortIds(diagram.nodes);
  const edges = shortIds(diagram.edges);
  const groups = shortIds(diagram.groups);
  const institutions = shortIds(diagram.customInstitutions);
  const round = ({ x, y }: { x: number; y: number }) => ({
    x: Math.round(x),
    y: Math.round(y),
  });
  return {
    schemaVersion: diagram.schemaVersion,
    name: diagram.name,
    description: diagram.description,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      id: nodes.get(node.id)!,
      position: round(node.position),
      groupId: node.groupId && groups.get(node.groupId),
      institutionId:
        node.institutionId &&
        (institutions.get(node.institutionId) ?? node.institutionId),
    })),
    edges: diagram.edges.map((edge) => ({
      ...edge,
      id: edges.get(edge.id)!,
      source: nodes.get(edge.source)!,
      target: nodes.get(edge.target)!,
    })),
    groups: diagram.groups.map((group) => ({
      ...group,
      id: groups.get(group.id)!,
      parentId: group.parentId && groups.get(group.parentId),
      position: round(group.position),
      width: Math.max(1, Math.round(group.width)),
      height: Math.max(1, Math.round(group.height)),
    })),
    customInstitutions: diagram.customInstitutions.map((institution) => ({
      ...institution,
      id: institutions.get(institution.id)!,
    })),
  };
}

export function v2Link(diagram: Diagram, base: string) {
  const data = deflateRawSync(JSON.stringify(compactV2(diagram)));
  return base + '#share=2.' + data.toString('base64url');
}
