import type { Diagram, MoneyNode } from '../../types/diagram';

export function allowsDirection(source?: MoneyNode, target?: MoneyNode) {
  return Boolean(
    source &&
    target &&
    source.id !== target.id &&
    source.type !== 'expense' &&
    target.type !== 'income',
  );
}
export function canConnect(diagram: Diagram, source: string, target: string) {
  return (
    allowsDirection(
      diagram.nodes.find((n) => n.id === source),
      diagram.nodes.find((n) => n.id === target),
    ) && !diagram.edges.some((e) => e.source === source && e.target === target)
  );
}
