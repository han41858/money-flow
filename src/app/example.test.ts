import { describe, expect, it } from 'vitest';
import { example } from './example';
import { diagramSchema } from '../types/diagram';
import { edgeWidth, amountLabel, sum } from '../features/edges/money';
import { buildGraph } from '../features/editor/graph';
import { canvasColor, contrast, strokeColor } from '../lib/brands/palette';
import { institutions } from '../lib/brands/registry';

describe('버전 1 다이어그램', () => {
  it('예제의 네 유형과 모든 연결을 복원한다', () => {
    expect(diagramSchema.parse(JSON.parse(JSON.stringify(example)))).toEqual(
      example,
    );
    expect(new Set(example.nodes.map((n) => n.type)).size).toBe(4);
    const graph = buildGraph(example);
    for (const e of graph.edges) {
      expect(
        graph.nodes.find((n) => n.id === e.source)?.data.outputs,
      ).toContain(e.id);
      expect(graph.nodes.find((n) => n.id === e.target)?.data.inputs).toContain(
        e.id,
      );
    }
    expect(
      graph.edges.find((edge) => edge.id === 'salary-a')?.data?.targetPort,
    ).toBeLessThan(
      graph.edges.find((edge) => edge.id === 'salary-b')!.data!.targetPort,
    );
    expect(graph.nodes.find((n) => n.id === 'joint')?.data.inputs).toEqual([
      'salary-a',
      'salary-b',
    ]);
  });
  it('지원하지 않는 버전과 끊긴 참조를 거부한다', () => {
    expect(
      diagramSchema.safeParse({ ...example, schemaVersion: 3 }).success,
    ).toBe(false);
    expect(diagramSchema.safeParse({ ...example, nodes: [] }).success).toBe(
      false,
    );
  });
  it.each([
    { min: 2, max: 1 },
    { min: -1 },
    { min: 0.5 },
    { min: '' },
    { source: 'joint', target: 'joint' },
    { target: 'income-a' },
    { source: 'living' },
  ])('잘못된 연결을 거부한다 (%j)', (change) => {
    expect(
      diagramSchema.safeParse({
        ...example,
        edges: [{ ...example.edges[0], ...change }],
      }).success,
    ).toBe(false);
  });
  it('같은 방향의 중복 연결을 거부한다', () => {
    expect(
      diagramSchema.safeParse({
        ...example,
        edges: [...example.edges, { ...example.edges[0], id: 'duplicate' }],
      }).success,
    ).toBe(false);
  });
});
describe('금액 및 색상', () => {
  it.each([
    [0, 0, '0'],
    [500000, 500000, '50만'],
    [0, 200000, '0~20만'],
    [32000, 45500, '32,000~45,500'],
    [120000000, 120000000, '1억 2,000만'],
  ])('금액 표기 %s~%s', (min, max, label) => {
    expect(amountLabel(Number(min), Number(max))).toBe(label);
  });
  it('월 합계를 계산하고 두께를 고정 범위로 제한한다', () => {
    expect(sum(example.edges.filter((e) => e.target === 'joint'))).toEqual({
      min: 5600000,
      max: 5600000,
    });
    expect(edgeWidth({ min: 0, max: 0 })).toBe(2);
    expect(edgeWidth({ min: 1e8, max: 1e8 })).toBe(14);
    expect(edgeWidth({ min: 0, max: 2e6 })).toBe(
      edgeWidth({ min: 1e6, max: 1e6 }),
    );
  });
  it('25개 금융사의 테두리가 캔버스와 3:1 이상 대비된다', () => {
    expect(new Set(institutions.map((b) => b.id)).size).toBe(25);
    for (const bank of institutions)
      expect(
        contrast(strokeColor(bank.color), canvasColor),
      ).toBeGreaterThanOrEqual(3);
  });
});

it('억 경계를 넘는 범위는 양 끝을 각각 읽을 수 있게 표기한다', () => {
  expect(amountLabel(100000000, 200000000)).toBe('1억~2억');
  expect(amountLabel(10000, 120000000)).toBe('1만~1억 2,000만');
  expect(amountLabel(99999999, 100000000)).toBe('99,999,999~1억');
  expect(amountLabel(100000000, 100000001)).toBe('1억~100,000,001');
});
