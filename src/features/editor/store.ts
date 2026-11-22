import { create } from 'zustand';
import { temporal } from 'zundo';
import { blankDiagram } from '../../lib/storage/format';
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
import { arrangeDiagram } from './arrange';

import {
  absoluteFrom,
  relativeTo,
  assignGroup,
  membersAfterResize,
  type NodeSizes,
  type Group,
  type Size,
} from '../groups/geometry';

type Position = MoneyNode['position'];
export type Kind = MoneyNode['type'];
export type Selection = { nodes: string[]; edges: string[]; groups: string[] };
export const emptySelection: Selection = { nodes: [], edges: [], groups: [] };

export function nodeOfType(
  type: Kind,
  base: Pick<
    MoneyNode,
    'id' | 'name' | 'position' | 'owner' | 'groupId' | 'institutionId'
  >,
): MoneyNode {
  const { id, name, position, owner, groupId } = base;
  const core = {
    id,
    name,
    position,
    owner,
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

  function addNode(type: Kind, position: Position) {
    const node = nodeOfType(type, {
      id: crypto.randomUUID(),
      name: '새 ' + kindNames[type],
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
    const d = current();
    const colors = ['#92ab86', '#86aabe', '#c2a0ae', '#b6a478'];
    const group = {
      ...bounds,
      id: crypto.randomUUID(),
      name: '새 그룹',
      color: colors[d.groups.length % colors.length],
    };
    const groups = [...d.groups, group];
    commit({
      groups,
      nodes: membersAfterResize(d.nodes, groups, group, sizes),
    });
    return group.id;
  }

  function editGroup(
    id: string,
    patch: Partial<Pick<Group, 'name' | 'color'>>,
  ) {
    const d = current();
    const group = d.groups.find((g) => g.id === id);
    if (!group) return;
    const name = patch.name?.trim() ?? group.name;
    const color = patch.color ?? group.color;
    if (
      !name ||
      !/^#[a-f0-9]{6}$/i.test(color) ||
      (name === group.name && color === group.color)
    )
      return;
    commit({
      groups: d.groups.map((g) => (g === group ? { ...g, name, color } : g)),
    });
  }

  function resizeGroup(id: string, size: Size, sizes: NodeSizes) {
    const d = current();
    const group = d.groups.find((g) => g.id === id);
    if (
      !group ||
      !(size.width > 0 && size.height > 0) ||
      !Number.isFinite(size.width + size.height) ||
      (size.width === group.width && size.height === group.height)
    )
      return;
    const region = { ...group, ...size };
    const groups = d.groups.map((g) => (g === group ? region : g));
    commit({
      groups,
      nodes: membersAfterResize(d.nodes, groups, region, sizes),
    });
  }

  function move(
    positions: Map<string, Position>,
    groupPositions: Map<string, Position> = new Map(),
    sizes: NodeSizes = new Map(),
  ) {
    const d = current();
    const deltas = new Map<string, Position>();
    const groups = d.groups.map((g) => {
      const point = groupPositions.get(g.id);
      if (!point || (point.x === g.position.x && point.y === g.position.y))
        return g;
      deltas.set(g.id, relativeTo(point, g.position));
      return { ...g, position: point };
    });
    const nodes = d.nodes.map((n) => {
      const delta = n.groupId && deltas.get(n.groupId);
      if (delta) return { ...n, position: absoluteFrom(n.position, delta) };
      const point = positions.get(n.id);
      if (!point) return n;
      const moved =
        point.x === n.position.x && point.y === n.position.y
          ? n
          : { ...n, position: point };
      return assignGroup(moved, groups, sizes);
    });
    if (deltas.size || nodes.some((n, i) => n !== d.nodes[i]))
      commit({ groups, nodes });
  }

  function autoArrange(sizes: NodeSizes) {
    const diagram = current();
    if (!diagram.nodes.length) return;
    const arranged = arrangeDiagram(diagram, sizes);
    const moved = (next: Position, previous: Position) =>
      next.x !== previous.x || next.y !== previous.y;
    if (
      arranged.nodes.some((node, i) =>
        moved(node.position, diagram.nodes[i].position),
      ) ||
      arranged.groups.some((group, i) => {
        const previous = diagram.groups[i];
        return (
          moved(group.position, previous.position) ||
          group.width !== previous.width ||
          group.height !== previous.height
        );
      })
    )
      commit(arranged);
  }

  function remove(selected: Selection) {
    const d = current();
    const groups = d.groups.filter((g) => !selected.groups.includes(g.id));
    const nodes = d.nodes
      .filter((n) => !selected.nodes.includes(n.id))
      .map((n) =>
        n.groupId && selected.groups.includes(n.groupId)
          ? { ...n, groupId: undefined }
          : n,
      );
    const edges = d.edges.filter(
      (e) =>
        !selected.edges.includes(e.id) &&
        !selected.nodes.includes(e.source) &&
        !selected.nodes.includes(e.target),
    );
    if (
      groups.length !== d.groups.length ||
      nodes.length !== d.nodes.length ||
      edges.length !== d.edges.length
    )
      commit({ groups, nodes, edges });
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
    remove,
    newDiagram,
    load,
    rename,
    history: useDiagram.temporal,
  };
}

export const editor = createEditor(blankDiagram());
