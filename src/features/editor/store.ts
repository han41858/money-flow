import { create } from 'zustand';
import { temporal } from 'zundo';
import { blankDiagram } from '../../lib/storage/format';
import { example } from '../../app/example';
import {
  edgeSchema,
  nodeSchema,
  type Diagram,
  type MoneyNode,
  type MoneyEdge,
} from '../../types/diagram';
import { canConnect } from '../edges/connections';
import { kindNames } from '../nodes/presentation';
import { institutions } from '../../lib/brands/registry';

type Position = MoneyNode['position'];
export type Kind = MoneyNode['type'];
export type Selection = { nodes: string[]; edges: string[] };
export const emptySelection: Selection = { nodes: [], edges: [] };

export function nodeOfType(
  type: Kind,
  base: Pick<MoneyNode, 'id' | 'name' | 'position' | 'owner' | 'groupId'>,
): MoneyNode {
  const { id, name, position, owner, groupId } = base;
  const core = { id, name, position, owner, groupId };
  switch (type) {
    case 'account':
      return { ...core, type, institutionId: 'kakao' };
    case 'card':
      return { ...core, type, institutionId: 'shinhan-card' };
    case 'expense':
      return { ...core, type, category: 'consumption' };
    case 'income':
      return { ...core, type };
  }
}
export function createEditor(initial: Diagram) {
  const useDiagram = create<{ diagram: Diagram }>()(
    temporal(() => ({ diagram: initial }), { limit: 150 }),
  );
  const current = () => useDiagram.getState().diagram;
  function commit(change: Partial<Diagram>) {
    useDiagram.setState({
      diagram: { ...current(), ...change, updatedAt: new Date().toISOString() },
    });
  }
  function addNode(type: Kind, position: Position) {
    const node = nodeOfType(type, {
      id: crypto.randomUUID(),
      name: '새 ' + kindNames[type],
      position,
    });
    commit({ nodes: [...current().nodes, node] });
    return node.id;
  }
  function editNode(node: MoneyNode) {
    const d = current();
    if (!d.nodes.some((n) => n.id === node.id)) return false;
    if (
      (node.type === 'income' && d.edges.some((e) => e.target === node.id)) ||
      (node.type === 'expense' && d.edges.some((e) => e.source === node.id))
    )
      return false;
    const valid = nodeSchema.safeParse(node);
    if (!valid.success) return false;
    commit({ nodes: d.nodes.map((n) => (n.id === node.id ? valid.data : n)) });
    return true;
  }
  function addInstitution(nodeId: string, name: string, color: string) {
    const d = current(),
      node = d.nodes.find((n) => n.id === nodeId);
    if (!node || !name.trim() || !/^#[0-9a-f]{6}$/i.test(color)) return false;
    if (
      [...institutions, ...d.customInstitutions].some(
        (b) => b.name === name.trim(),
      )
    )
      return false;
    const brand = { id: crypto.randomUUID(), name: name.trim(), color };
    commit({
      customInstitutions: [...d.customInstitutions, brand],
      nodes: d.nodes.map((n) =>
        n.id === node.id ? { ...n, institutionId: brand.id } : n,
      ),
    });
    return true;
  }
  function connect(source: string, target: string) {
    if (!canConnect(current(), source, target)) return;
    const edge = { id: crypto.randomUUID(), source, target, min: 0, max: 0 };
    commit({ edges: [...current().edges, edge] });
    return edge.id;
  }
  function editEdge(
    id: string,
    patch: Partial<Pick<MoneyEdge, 'min' | 'max' | 'memo'>>,
  ) {
    const d = current(),
      edge = d.edges.find((e) => e.id === id);
    if (!edge) return false;
    const valid = edgeSchema.safeParse({ ...edge, ...patch });
    if (!valid.success) return false;
    if (
      valid.data.min !== edge.min ||
      valid.data.max !== edge.max ||
      valid.data.memo !== edge.memo
    )
      commit({ edges: d.edges.map((e) => (e.id === id ? valid.data : e)) });
    return true;
  }
  function move(positions: Map<string, Position>) {
    let changed = false;
    const nodes = current().nodes.map((n) => {
      const point = positions.get(n.id);
      if (!point || (n.position.x === point.x && n.position.y === point.y))
        return n;
      changed = true;
      return { ...n, position: point };
    });
    if (changed) commit({ nodes });
  }
  function remove(selected: Selection) {
    const d = current(),
      nodes = d.nodes.filter((n) => !selected.nodes.includes(n.id));
    const edges = d.edges.filter(
      (e) =>
        !selected.edges.includes(e.id) &&
        !selected.nodes.includes(e.source) &&
        !selected.nodes.includes(e.target),
    );
    if (nodes.length !== d.nodes.length || edges.length !== d.edges.length)
      commit({ nodes, edges });
  }
  function load(diagram: Diagram) {
    useDiagram.setState({ diagram });
    useDiagram.temporal.getState().clear();
  }
  function newDiagram() {
    load(blankDiagram());
  }
  function rename(name: string) {
    if (name.trim() && name.trim() !== current().name)
      commit({ name: name.trim() });
  }
  return {
    useDiagram,
    current,
    addNode,
    editNode,
    editEdge,
    addInstitution,
    connect,
    move,
    remove,
    newDiagram,
    load,
    rename,
    history: useDiagram.temporal,
  };
}
export const editor = createEditor(example);
