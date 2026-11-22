import { expect, test } from 'vitest';
import { example } from '../../app/example';
import { renderSvg } from './scene';
import { amountLabel } from '../edges/money';
test('모든 노드·금액·그룹을 순수 SVG로 만들고 XML 문자를 이스케이프한다', () => {
  const svg = renderSvg({ ...example, name: 'A & <B>' }, new Map());
  for (const item of [...example.nodes, ...example.groups])
    expect(svg).toContain(item.name);
  for (const g of example.groups) expect(svg).toContain(g.color);
  for (const e of example.edges)
    expect(svg).toContain(amountLabel(e.min, e.max));
  expect(svg.match(/<path d="M [^"]+ Z"/g)).toHaveLength(example.edges.length);
  expect(svg).toContain('💳');
  expect(svg).toContain('A &amp; &lt;B&gt;');
  expect(svg).not.toMatch(/foreignObject|react-flow/);
});
test('음수 좌표에서 측정된 전체 노드와 40px 여백을 포함하고 뷰포트와 무관하다', () => {
  const node = { ...example.nodes[0], position: { x: -470, y: -600 } };
  const d = { ...example, nodes: [node], groups: [], edges: [] };
  const size = new Map([[node.id, { width: 290, height: 170 }]]);
  const svg = renderSvg(d, size);
  expect(svg).toContain('viewBox="-511 -641 372 252"');
  expect(
    renderSvg({ ...d, viewport: { x: 8000, y: 0, zoom: 0.1 } }, size),
  ).toBe(svg);
});
