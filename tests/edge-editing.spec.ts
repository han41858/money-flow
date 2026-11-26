import { example } from '../src/app/example';
import { openExample } from './exampleFixture';
import { test, expect } from '@playwright/test';
import { point, port, selectNode } from './gestures';

test('연결선 레이블에서 고정 금액과 범위를 직접 수정한다', async ({ page }) => {
  await openExample(page);
  const totals = page.locator('[data-id="joint"] .node-totals text');
  await expect(totals).toHaveText(['560만', '228~258만']);
  await expect(totals.first()).toHaveAttribute('text-anchor', 'start');
  await expect(totals.last()).toHaveAttribute('text-anchor', 'end');
  expect(await totals.first().getAttribute('y')).toBe(
    await totals.last().getAttribute('y'),
  );
  await expect(page.locator('[data-id="income-a"] .node-totals')).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '3,200,000원 금액 수정' }).click();
  const input = page.getByRole('textbox', { name: '연결선 금액 (원)' });
  await expect(input).toHaveValue('3200000');
  expect(await input.evaluate((el) => el.clientWidth)).toBeLessThan(110);
  await input.fill('900000~800000');
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('800000~900000');
  await input.press('Enter');
  const button = page.getByRole('button', {
    name: '800,000원 ~ 900,000원 금액 수정',
  });
  await expect(button).toBeFocused();
  await expect(totals.first()).toHaveText('320~330만');
  await button.click();
  await input.fill('1234');
  await input.press('Escape');
  await expect(button).toBeVisible();
  await button.click();
  await input.fill('700000');
  await input.press('Tab');
  await expect(
    page.getByRole('button', { name: '700,000원 금액 수정' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(button).toBeVisible();
  await button.click();
  await input.fill('1000000000');
  await input.press('Enter');
  await expect(
    page.getByRole('button', { name: '1,000,000,000원 금액 수정' }),
  ).toBeVisible();
});

test('금액 레이블과 겹친 출발·도착 포트가 연결 조작을 먼저 받는다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const [income, , account] = example.nodes;
  await openExample(page, {
    ...example,
    groups: [],
    nodes: [
      {
        ...income,
        name: '수입',
        groupId: undefined,
        position: { x: 0, y: 100 },
      },
      {
        ...account,
        name: '계좌',
        groupId: undefined,
        position: { x: 500, y: 100 },
      },
      {
        ...income,
        id: 'second-income',
        name: '수입',
        groupId: undefined,
        position: { x: 185, y: 100 },
      },
      {
        ...account,
        id: 'second-account',
        name: '계좌',
        groupId: undefined,
        position: { x: 286, y: 100 },
      },
    ],
    edges: [{ ...example.edges[0], min: 0, max: 0 }],
  });
  const outgoing = page.locator('[data-id="second-income"]');
  const incoming = page.locator('[data-id="second-account"]');
  const source = await port(page, outgoing, 'source');
  const target = await port(page, incoming, 'target');
  const label = page.getByRole('button', { name: '0원 금액 수정' });
  await expect(label).toBeVisible();
  const from = await point(source);
  const to = await point(target);
  const labelBox = (await label.boundingBox())!;
  for (const p of [from, to]) {
    expect(p.x).toBeGreaterThan(labelBox.x);
    expect(p.x).toBeLessThan(labelBox.x + labelBox.width);
    expect(p.y).toBeGreaterThan(labelBox.y);
    expect(p.y).toBeLessThan(labelBox.y + labelBox.height);
  }

  await page.keyboard.press('Tab');
  await outgoing.focus();
  await expect(source).toHaveCSS('opacity', '1');
  await outgoing.blur();
  await expect(source).toHaveCSS('opacity', '0');

  await page.mouse.move(from.x, from.y);
  await expect(source).toHaveCSS('opacity', '1');
  expect(
    await source.evaluate(
      (el, p) => document.elementFromPoint(p.x, p.y) === el,
      from,
    ),
  ).toBe(true);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(target).toHaveCSS('opacity', '1');
  expect(
    await target.evaluate(
      (el, p) => document.elementFromPoint(p.x, p.y) === el,
      to,
    ),
  ).toBe(true);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(target).toHaveCSS('opacity', '0');

  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await source.click();
  await expect(target).toHaveCSS('opacity', '1');
  await target.click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
});

for (const [direction, y] of [
  ['오르막', 20],
  ['수평', 180],
  ['내리막', 340],
] as const)
  test(`${direction} 연결의 금액을 화살촉 앞 곡선의 길이 중간에 배치한다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const [source, , target] = example.nodes;
    await openExample(page, {
      ...example,
      groups: [],
      nodes: [
        { ...source, groupId: undefined, position: { x: 0, y: 180 } },
        { ...target, groupId: undefined, position: { x: 440, y } },
      ],
      edges: [{ ...example.edges[0], min: 1_200_000, max: 1_500_000 }],
    });
    const label = page.getByRole('button', {
      name: '1,200,000원 ~ 1,500,000원 금액 수정',
    });
    await expect(label).toBeVisible();
    const path = page.locator('.react-flow__edge-path');
    const center = await path.evaluate((el: SVGPathElement) => {
      const midpoint = el.getPointAtLength(el.getTotalLength() / 2);
      const { x, y } = midpoint.matrixTransform(el.getScreenCTM()!);
      return { x, y };
    });
    const box = (await label.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - center.x)).toBeLessThan(1);
    expect(Math.abs(box.y + box.height / 2 - center.y)).toBeLessThan(1);
  });

test('노드와 겹치는 연결선 금액을 열고 저장할 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const [source, , target] = example.nodes;
  await openExample(page, {
    ...example,
    groups: [],
    nodes: [
      { ...source, name: '수입', groupId: undefined, position: { x: 0, y: 0 } },
      {
        ...target,
        name: '계좌',
        groupId: undefined,
        position: { x: 125, y: 20 },
      },
    ],
    edges: [example.edges[0]],
  });
  const label = page.getByRole('button', { name: '3,200,000원 금액 수정' });
  await label.click();
  const input = page.getByRole('textbox', { name: '연결선 금액 (원)' });
  const sourceNode = page.locator('[data-id="income-a"].react-flow__node');
  const card = (await sourceNode.boundingBox())!;
  const box = (await input.boundingBox())!;
  const x = (box.x + card.x + card.width) / 2;
  const y = box.y + box.height / 2;
  expect(x).toBeGreaterThan(box.x);
  expect(x).toBeGreaterThan(card.x);
  expect(y).toBeGreaterThan(card.y);
  expect(y).toBeLessThan(card.y + card.height);
  expect(
    await input.evaluate(
      (el, p) => document.elementFromPoint(p.x, p.y) === el,
      { x, y },
    ),
  ).toBe(true);
  await page.mouse.click(x, y);
  await input.fill('5000000');
  await input.press('Enter');
  await expect(
    page.getByRole('button', { name: '5,000,000원 금액 수정' }),
  ).toBeVisible();
});

test('노드 위를 지나는 연결선이 카드 드래그를 가로채지 않는다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const [source, blocker, target] = example.nodes;
  await openExample(page, {
    ...example,
    groups: [],
    nodes: [
      { ...source, name: '수입', groupId: undefined, position: { x: 0, y: 0 } },
      {
        ...blocker,
        name: '겹친 카드',
        groupId: undefined,
        position: { x: 140, y: 0 },
      },
      {
        ...target,
        name: '계좌',
        groupId: undefined,
        position: { x: 310, y: 0 },
      },
    ],
    edges: [example.edges[0]],
  });
  const card = page.locator('[data-id="income-b"].react-flow__node');
  const box = (await card.boundingBox())!;
  const x = box.x + box.width - 4;
  const y = box.y + box.height / 2;
  await expect
    .poll(() =>
      card.evaluate(
        (el, p) => el.contains(document.elementFromPoint(p.x, p.y)),
        { x, y },
      ),
    )
    .toBe(true);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 45, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await card.boundingBox())!.y)
    .toBeGreaterThan(box.y + 20);
  await selectNode(card);
  await expect(card).toHaveClass(/selected/);
});
