import { expect, test } from 'vitest';
import { example } from '../../app/example';
import { buildGraph } from '../editor/graph';
import { portSize } from '../nodes/sizing';
import { transferRoute } from './route';

test('실측 카드 크기를 장애물과 캔버스·내보내기 연결점에 동일하게 사용한다', () => {
  const [edge] = example.edges;
  const sizes = new Map([
    [edge.source, { width: 263, height: 64 }],
    [edge.target, { width: 319, height: 52 }],
  ]);
  const graph = buildGraph(example, undefined, sizes);
  const data = graph.edges[0].data!;
  const { sourceCard: source, targetCard: target } = data;
  expect(source).toMatchObject(sizes.get(edge.source)!);
  expect(target).toMatchObject(sizes.get(edge.target)!);
  expect(data.obstacles).toContain(source);
  expect(data.obstacles).toContain(target);
  expect(
    transferRoute(data, {
      source: {
        x: source.x + source.width + portSize,
        y: source.y + source.height / 2,
      },
      target: { x: target.x - portSize, y: target.y + target.height / 2 },
    }),
  ).toEqual(transferRoute(data));
});
