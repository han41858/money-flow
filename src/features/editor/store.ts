import { create } from 'zustand';
import { temporal } from 'zundo';
import { blankDiagram } from '../../lib/storage/format';
import {
  colorPattern,
  edgeSchema,
  nodeSchema,
  type Diagram,
  type MoneyNode,
  type MoneyEdge,
} from '../../types/diagram';
import { canConnect } from '../edges/connections';
import type { MeasureText } from '../nodes/sizing';
import { newNodeName } from '../nodes/presentation';
import { institutions } from '../../lib/brands/registry';
import {
  assignGroup,
  type NodeSizes,
  type Group,
  type Size,
} from '../groups/geometry';
import * as clipboard from './clipboard';
import type { NodeClipboard } from './clipboard';
import * as operations from './operations';

type Position = MoneyNode['position'];
export type Kind = MoneyNode['type'];
export type Selection = { nodes: string[]; edges: string[]; groups: string[] };
export type { NodeClipboard };
export const emptySelection: Selection = { nodes: [], edges: [], groups: [] };

export function nodeOfType(
  type: Kind,
  base: Pick<
    MoneyNode,
    'id' | 'name' | 'position' | 'groupId' | 'institutionId'
  >,
): MoneyNode {
  const { id, name, position, groupId } = base;
  const core = {
    id,
    name,
    position,
    groupId,
    institutionId: base.institutionId,
  };
  switch (type) {
    case 'account':
    case 'card':
      return { ...core, type };
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

  function apply(change: Partial<Diagram> | null) {
    if (change) commit(change);
  }

  function addNode(type: Kind, position: Position) {
    const node = nodeOfType(type, {
      id: crypto.randomUUID(),
      name: newNodeName(type),
      position,
    });
    const diagram = current();
    const member = assignGroup(node, diagram.groups, new Map());
    commit({ nodes: [...diagram.nodes, member] });
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
    const d = current();
    const node = d.nodes.find((n) => n.id === nodeId);
    if (!node || !name.trim() || !colorPattern.test(color)) return false;
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
    const d = current();
    const edge = d.edges.find((e) => e.id === id);
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

  function addGroup(
    bounds: Pick<Group, 'position' | 'width' | 'height'>,
    sizes: NodeSizes,
  ) {
    const { change, id } = operations.addGroup(current(), bounds, sizes);
    commit(change);
    return id;
  }

  function editGroup(
    id: string,
    patch: Partial<Pick<Group, 'name' | 'color'>>,
  ) {
    apply(operations.editGroup(current(), id, patch));
  }

  function resizeGroup(id: string, size: Size, sizes: NodeSizes) {
    apply(operations.resizeGroup(current(), id, size, sizes));
  }

  function move(
    positions: Map<string, Position>,
    groupPositions: Map<string, Position> = new Map(),
    sizes: NodeSizes = new Map(),
  ) {
    apply(operations.moveItems(current(), positions, groupPositions, sizes));
  }

  function autoArrange(sizes: NodeSizes) {
    apply(operations.autoArrange(current(), sizes));
  }

  function copyNodes(selected: readonly string[]) {
    return clipboard.copyNodes(current(), selected);
  }

  function pasteNodes(
    copied: NodeClipboard,
    center: Position,
    measure?: MeasureText,
  ) {
    const { change, ids } = clipboard.pasteNodes(
      current(),
      copied,
      center,
      measure,
    );
    commit(change);
    return ids;
  }

  function remove(selected: Selection) {
    apply(operations.removeSelection(current(), selected));
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
    addGroup,
    editGroup,
    resizeGroup,
    move,
    autoArrange,
    copyNodes,
    pasteNodes,
    remove,
    newDiagram,
    load,
    rename,
    history: useDiagram.temporal,
  };
}

export const editor = createEditor(blankDiagram());
