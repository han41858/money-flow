import { expect, test } from 'vitest';
import { defaultNodeSize } from '../groups/geometry';
import { portFraction, transferGeometry } from './geometry';
import { edgeWidth } from './money';

test('짧은 노드에 도착하는 굵은 화살촉은 서로 겹치지 않는다', () => {
  const count = 3;
  const width = edgeWidth({ min: 10_000_000, max: 10_000_000 });
  const heads = Array.from({ length: count }, (_, i) => {
    const y = defaultNodeSize.height * portFraction(i, count);
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
