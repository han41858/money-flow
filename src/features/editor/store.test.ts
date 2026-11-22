import { describe, it, expect } from 'vitest';
import { example } from '../../app/example';
import { diagramSchema } from '../../types/diagram';
import { canConnect } from '../edges/connections';
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
