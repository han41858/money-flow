import { expect, test } from 'vitest';
import { nodeHeight } from '../nodes/sizing';
import { portFraction, transferGeometry } from './geometry';
import { edgeWidth } from './money';

test('짧은 노드에 도착하는 굵은 화살촉은 서로 겹치지 않는다', () => {
  const count = 3;
  const width = edgeWidth({ min: 10_000_000, max: 10_000_000 });
  const heads = Array.from({ length: count }, (_, i) => {
    const y = nodeHeight * portFraction(i, count);
    const { arrow } = transferGeometry(0, y, 160, y, width, count);
    return arrow.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  });
  for (const [i, [base, top, tip, , , bottom]] of heads.entries()) {
    expect(tip - base).toBeGreaterThan(width);
    if (i > 0) expect(top).toBeGreaterThan(heads[i - 1][5]);
    expect(bottom).toBeGreaterThan(top);
  }
});

test('짧은 연결의 금액 레이블은 화살촉 위에서 읽을 수 있다', () => {
  const { y } = transferGeometry(0, 30, 48, 30, 14, 1);
  expect(y).toBeLessThan(14);
});

test('800만 원 연결선은 출발 두께를 유지하고 화살촉 앞에서 좁아진다', () => {
  const width = edgeWidth({ min: 8_000_000, max: 8_000_000 });
  const { shaft, arrow } = transferGeometry(0, 30, 160, 90, width, 3);
  const coordinates = (path: string) =>
    path.match(/-?(?:\d*\.)?\d+/g)!.map(Number);
  const line = coordinates(shaft);
  const head = coordinates(arrow);
  expect(line[15] - line[1]).toBeCloseTo(width);
  expect(line[9] - line[7]).toBeLessThan(width);
  expect(line[7]).toBeGreaterThan(head[1]);
  expect(line[9]).toBeLessThan(head[5]);
});
