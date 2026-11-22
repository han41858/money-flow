import { describe, it, expect } from 'vitest';
import { example } from '../../app/example';
import { diagramSchema } from '../../types/diagram';
import { canConnect } from '../edges/connections';
import { cardSize, nodeHeight, totalLineHeight } from '../nodes/sizing';
import { arrangeDiagram } from './arrange';
import { createEditor, nodeOfType } from './store';

describe('편집 이력', () => {
  it('빈 다이어그램에서 노드, 연결, 금액, 일괄 이동·삭제를 작업 단위로 되돌린다', () => {
    const ed = createEditor(example);
    ed.newDiagram();
    const p = { x: 0, y: 0 };
    const a = ed.addNode('income', p);
    const b = ed.addNode('account', p);
    const c = ed.addNode('expense', p);
    ed.connect(a, b);
    const edge = ed.connect(b, c)!;
    expect(ed.editEdge(edge, { min: 500000, max: 800000 })).toBe(true);
    const before = ed.current();
    ed.move(
      new Map([
        [a, { x: 5, y: 8 }],
        [b, { x: 15, y: 28 }],
      ]),
    );
    const moved = ed.current();
    ed.remove({ groups: [], nodes: [a, b], edges: [edge] });
    expect(ed.current().edges).toHaveLength(0);
    ed.history.getState().undo();
    expect(ed.current()).toEqual(moved);
    ed.history.getState().undo();
    expect(ed.current()).toEqual(before);
    ed.history.getState().undo();
    expect(ed.current().edges.at(-1)?.max).toBe(0);
    ed.history.getState().redo();
    expect(ed.current()).toEqual(before);
    ed.remove({ groups: [], nodes: [], edges: [edge] });
    expect(ed.history.getState().futureStates).toHaveLength(0);
    ed.newDiagram();
    expect(ed.history.getState().pastStates).toHaveLength(0);
  });
  it('유효하지 않은 작업은 데이터와 이력을 바꾸지 않는다', () => {
    const ed = createEditor(example);
    expect(ed.connect('joint', 'joint')).toBeUndefined();
    expect(ed.connect('joint', 'card')).toBeUndefined();
    expect(ed.connect('living', 'income-a')).toBeUndefined();
    expect(ed.editEdge('salary-a', { min: 5e6 })).toBe(false);
    expect(ed.editNode(nodeOfType('expense', example.nodes[0]))).toBe(false);
    expect(ed.current()).toBe(example);
    expect(ed.history.getState().pastStates).toHaveLength(0);
    expect(canConnect(example, 'card', 'joint')).toBe(true);
    ed.connect('card', 'joint');
    expect(diagramSchema.safeParse(ed.current()).success).toBe(true);
  });
  it('순환 연결과 그룹을 보존하며 자동 정렬을 반복해도 이력을 추가하지 않는다', () => {
    const ed = createEditor(example);
    ed.connect('card', 'joint');
    const before = ed.current();
    ed.autoArrange(new Map());
    const arranged = ed.current();
    expect(arranged.edges).toBe(before.edges);
    expect(arranged.nodes.map((n) => n.groupId)).toEqual(
      before.nodes.map((n) => n.groupId),
    );
    expect(arranged.nodes.map((n) => n.position)).not.toEqual(
      before.nodes.map((n) => n.position),
    );
    ed.autoArrange(new Map());
    expect(ed.current()).toBe(arranged);
    ed.history.getState().undo();
    expect(ed.current()).toBe(before);
  });
  it('붙여넣을 때 같은 이름의 금융사를 사용하고 기존 노드와 겹치지 않는다', () => {
    const source = createEditor(example);
    source.addInstitution('joint', '지역 은행', '#216443');
    const clipboard = source.copyNodes(['joint'])!;
    const target = createEditor(example);
    target.addInstitution('joint', '지역 은행', '#123456');
    const existing = target.current().nodes.find(({ id }) => id === 'joint')!;
    const { width, height } = cardSize(existing.name);
    const [id] = target.pasteNodes(clipboard, {
      x: existing.position.x + width / 2 + 1,
      y: existing.position.y + height / 2 + 1,
    });
    const pasted = target.current().nodes.find((node) => node.id === id)!;
    expect(target.current().customInstitutions).toHaveLength(1);
    expect(pasted.institutionId).toBe(existing.institutionId);
    expect(
      pasted.position.x >= existing.position.x + width ||
        pasted.position.y >= existing.position.y + height,
    ).toBe(true);
  });
  it('자동 정렬에서 화면에서 바꾼 그룹과 같은 단계의 노드 순서를 유지한다', () => {
    const ed = createEditor(example);
    ed.move(new Map(), new Map([['personal-b', { x: -24, y: -200 }]]));
    ed.move(new Map([['savings', { x: 680, y: 20 }]]));
    const before = ed.current();
    ed.autoArrange(new Map());
    const arranged = ed.current();
    const position = (id: string) =>
      arranged.nodes.find((node) => node.id === id)!.position;
    expect(position('income-b').y).toBeLessThan(position('income-a').y);
    expect(position('savings').x).toBe(position('card').x);
    expect(position('savings').y).toBeLessThan(position('card').y);
    expect(position('card').x - position('joint').x).toBe(
      Math.max(...before.nodes.map((node) => cardSize(node.name).width)) + 96,
    );
    expect(position('card').y - position('savings').y).toBeGreaterThanOrEqual(
      48 + 24,
    );
    expect(arranged.groups.map((group) => group.id)).toEqual(
      before.groups.map((group) => group.id),
    );
  });
  it.each([true, false])(
    '분기에서 하위 노드의 중심과 형제 간격을 맞춘다 (그룹: %s)',
    (grouped) => {
      const extra = {
        ...example.nodes.find((node) => node.id === 'telecom')!,
        id: 'third-expense',
        position: { x: 1020, y: 210 },
      };
      const diagram = {
        ...example,
        groups: grouped ? example.groups : [],
        nodes: [...example.nodes, extra].map((node) =>
          grouped ? node : { ...node, groupId: undefined },
        ),
        edges: [
          ...example.edges,
          {
            id: 'third-transfer',
            source: 'card',
            target: extra.id,
            min: 0,
            max: 0,
          },
        ],
      };
      const layout = arrangeDiagram(diagram, new Map());
      const position = (id: string) =>
        layout.nodes.find((node) => node.id === id)!.position;
      const first = position('living');
      const last = position(extra.id);
      const card = position('card');
      const savings = position('savings');
      expect(first.x).toBeGreaterThan(card.x);
      expect(first.x).toBe(last.x);
      expect(card.y + (nodeHeight + totalLineHeight) / 2).toBe(
        (first.y + last.y + nodeHeight) / 2,
      );
      expect(savings.y).toBe(last.y + nodeHeight + 24);
      expect(arrangeDiagram({ ...diagram, ...layout }, new Map())).toEqual(
        layout,
      );
    },
  );
  it('금융사 등록과 노드 적용을 한 번에 취소한다', () => {
    const ed = createEditor(example);
    expect(ed.addInstitution('joint', '지역 은행', '#216443')).toBe(true);
    expect(
      ed.current().nodes.find((n) => n.id === 'joint')?.institutionId,
    ).toBe(ed.current().customInstitutions[0].id);
    ed.history.getState().undo();
    expect(ed.current()).toEqual(example);
  });
});
