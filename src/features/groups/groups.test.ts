import { expect, it } from 'vitest';
import { createEditor } from '../editor/store';
import { blankDiagram } from '../../lib/storage/format';
import { buildGraph } from '../editor/graph';
import {
  absoluteFrom,
  assignGroup,
  newGroupBounds,
  relativeTo,
  type Group,
} from './geometry';
import type { MoneyNode } from '../../types/diagram';

const node: MoneyNode = {
  id: 'n',
  type: 'account',
  name: '생활비',
  institutionId: 'kakao',
  owner: '장현',
  position: { x: -40, y: 10 },
};
const sizes = new Map([['n', { width: 200, height: 140 }]]);
const box = { position: { x: 55, y: 70 }, width: 100, height: 80 };
const first: Group = { ...box, id: 'g', name: '장현', color: '#abc123' };
const getEditor = () => createEditor({ ...blankDiagram(), nodes: [node] });

it('실측 중심점이 경계에 있어도 포함하고 겹친 영역에서는 최근 그룹이 우선한다', () => {
  const second = { ...first, id: 'g2', position: { x: 60, y: 80 } };
  expect(assignGroup(node, [first, second], sizes).groupId).toBe('g2');
  expect(assignGroup(node, [second, first], sizes).groupId).toBe('g');
  expect(
    assignGroup({ ...node, position: { x: -46, y: 10 } }, [first], sizes)
      .groupId,
  ).toBeUndefined();
  expect(
    absoluteFrom(relativeTo(node.position, first.position), first.position),
  ).toEqual(node.position);
  const bounds = newGroupBounds([node], sizes, { x: 0, y: 0 });
  expect(bounds).toEqual({
    position: { x: -64, y: -34 },
    width: 248,
    height: 208,
  });
});
it('부모·자식을 함께 이동해도 한 번만 이동하고 겹쳐진 외부 노드는 그대로 둔다', () => {
  const ed = getEditor();
  const group = ed.addGroup(box, sizes);
  const outsider = ed.addNode('expense', { x: 315, y: 65 });
  const before = ed.current();
  ed.move(
    new Map([['n', { x: 310, y: 60 }]]),
    new Map([[group, { x: 405, y: 120 }]]),
    sizes,
  );
  const d = ed.current();
  expect(d.nodes[0]).toMatchObject({
    position: { x: 310, y: 60 },
    owner: '장현',
    groupId: group,
  });
  expect(d.nodes.find((n) => n.id === outsider)?.groupId).toBeUndefined();
  ed.history.getState().undo();
  expect(ed.current()).toEqual(before);
  ed.history.getState().redo();
  expect(ed.current()).toEqual(d);
});
it('노드 드롭 및 크기 조절 종료에서만 소속을 갱신하며 저장 좌표를 보존한다', () => {
  const ed = getEditor(),
    g = ed.addGroup(box, sizes);
  const newest = ed.addGroup(
    { ...box, position: { x: -10, y: -10 }, width: 30, height: 40 },
    sizes,
  );
  ed.resizeGroup(newest, { width: 80, height: 100 }, sizes);
  expect(ed.current().nodes[0]).toEqual({ ...node, groupId: newest });
  ed.resizeGroup(newest, { width: 60, height: 100 }, sizes);
  expect(ed.current().nodes[0]).toEqual({ ...node, groupId: g });
  ed.move(new Map([['n', { x: 500, y: 500 }]]), new Map(), sizes);
  expect(ed.current().nodes[0].groupId).toBeUndefined();
  ed.move(new Map([['n', node.position]]), new Map(), sizes);
  expect(ed.current().nodes[0].groupId).toBe(g);
  const before = ed.current();
  ed.remove({ groups: [g], nodes: [], edges: [] });
  expect(ed.current().nodes[0]).toEqual({ ...node, groupId: undefined });
  ed.history.getState().undo();
  expect(ed.current()).toEqual(before);
  ed.remove({ groups: [g], nodes: ['n'], edges: [] });
  expect(ed.current().nodes).toHaveLength(0);
  ed.history.getState().undo();
  expect(ed.current()).toEqual(before);
});
it('기존 파일에서 그룹과 금융 노드의 ID가 겹쳐도 부모와 자식을 구분한다', () => {
  const d = {
    ...blankDiagram(),
    nodes: [{ ...node, id: 'group:g', groupId: 'g' }],
    groups: [first],
  };
  const graph = buildGraph(d);
  expect(graph.nodes[0].parentId).toBe(graph.groupNodes[0].id);
  expect(graph.nodes[0].id).not.toBe(graph.groupNodes[0].id);
  expect(graph.nodes[0].position).toEqual(
    relativeTo(node.position, first.position),
  );
});
