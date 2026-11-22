import type { Diagram, MoneyNode } from '../../types/diagram';
import { institutions } from '../../lib/brands/registry';
import {
  absoluteFrom,
  assignGroup,
  rectsOverlap,
  relativeTo,
} from '../groups/geometry';
import { cardSize, type MeasureText } from '../nodes/sizing';

type Position = MoneyNode['position'];
export type NodeClipboard = Pick<
  Diagram,
  'nodes' | 'edges' | 'customInstitutions'
>;

// Copies the selected nodes with the links between them and their custom
// institutions.
export function copyNodes(
  diagram: Diagram,
  selected: readonly string[],
): NodeClipboard | null {
  const ids = new Set(selected);
  const nodes = diagram.nodes.filter((node) => ids.has(node.id));
  if (!nodes.length) return null;
  const brands = new Set(nodes.map((node) => node.institutionId));
  return {
    nodes,
    edges: diagram.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
    customInstitutions: diagram.customInstitutions.filter((brand) =>
      brands.has(brand.id),
    ),
  };
}

// Returns the diagram change that pastes the clipboard around `center`, and
// the IDs given to the pasted nodes.
export function pasteNodes(
  diagram: Diagram,
  clipboard: NodeClipboard,
  center: Position,
  measure?: MeasureText,
) {
  const customInstitutions = [...diagram.customInstitutions];
  const brandIds = new Map(
    clipboard.customInstitutions.map((brand) => {
      const existing = [...institutions, ...customInstitutions].find(
        (item) => item.name === brand.name.trim(),
      );
      if (existing) return [brand.id, existing.id];
      const copy = { ...brand, id: crypto.randomUUID() };
      customInstitutions.push(copy);
      return [brand.id, copy.id];
    }),
  );
  const boundsOf = (node: MoneyNode) => ({
    ...node.position,
    ...cardSize(node.name, measure),
  });
  const copied = clipboard.nodes.map(boundsOf);
  const origin = {
    x:
      (Math.min(...copied.map(({ x }) => x)) +
        Math.max(...copied.map(({ x, width }) => x + width))) /
      2,
    y:
      (Math.min(...copied.map(({ y }) => y)) +
        Math.max(...copied.map(({ y, height }) => y + height))) /
      2,
  };
  const occupied = diagram.nodes.map(boundsOf);
  const positions = copied.map((node) =>
    absoluteFrom(relativeTo(node, origin), center),
  );
  // Step diagonally until the pasted nodes cover no existing node.
  let shift = 0;
  const shifted = ({ x, y }: Position) => ({ x: x + shift, y: y + shift });
  while (
    positions.some((point, index) => {
      const { width, height } = copied[index];
      const pasted = { ...shifted(point), width, height };
      return occupied.some((node) => rectsOverlap(pasted, node));
    })
  )
    shift += 28;

  const ids = new Map(
    clipboard.nodes.map((node) => [node.id, crypto.randomUUID()]),
  );
  const sizes = new Map(
    clipboard.nodes.map((node, i) => {
      const { width, height } = copied[i];
      return [ids.get(node.id)!, { width, height }];
    }),
  );
  const nodes = clipboard.nodes.map((node, i) =>
    assignGroup(
      {
        ...node,
        id: ids.get(node.id)!,
        position: shifted(positions[i]),
        institutionId:
          brandIds.get(node.institutionId ?? '') ?? node.institutionId,
      },
      diagram.groups,
      sizes,
    ),
  );
  const edges = clipboard.edges.map((edge) => ({
    ...edge,
    id: crypto.randomUUID(),
    source: ids.get(edge.source)!,
    target: ids.get(edge.target)!,
  }));
  return {
    change: {
      nodes: [...diagram.nodes, ...nodes],
      edges: [...diagram.edges, ...edges],
      customInstitutions,
    },
    ids: nodes.map((node) => node.id),
  };
}
