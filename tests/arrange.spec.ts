import { expect, test, type Locator } from '@playwright/test';
import { example } from '../src/app/example';
import { openExample } from './exampleFixture';

async function bounds(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

type Box = Awaited<ReturnType<typeof bounds>>;
const centerY = (box: Box) => box.y + box.height / 2;

function overlaps(a: Box, b: Box) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

test('자동 정렬에서 두 수입의 합류와 별도 지출 분기를 유지하며 일대일 연결을 수평으로 맞춘다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const [incomeA, incomeB, joint] = example.nodes;
  const [groupA, groupB, downstreamGroup] = example.groups;
  await openExample(page, {
    ...example,
    groups: [
      groupA,
      groupB,
      {
        ...downstreamGroup,
        name: '그룹 A',
        position: { x: 630, y: 50 },
        width: 620,
        height: 390,
      },
    ],
    nodes: [
      incomeA,
      incomeB,
      { ...joint, name: '새', groupId: undefined },
      {
        id: 'next-account',
        type: 'account',
        name: 'ㄹㄹㄹ',
        groupId: downstreamGroup.id,
        position: { x: 680, y: 108 },
      },
      {
        id: 'direct-expense',
        type: 'expense',
        category: 'consumption',
        name: '새 지출',
        groupId: downstreamGroup.id,
        position: { x: 680, y: 292 },
      },
      {
        id: 'chained-expense',
        type: 'expense',
        category: 'consumption',
        name: '새 지출',
        groupId: downstreamGroup.id,
        position: { x: 1020, y: 180 },
      },
    ],
    edges: [
      ...example.edges.slice(0, 2),
      {
        id: 'to-account',
        source: joint.id,
        target: 'next-account',
        min: 1200000,
        max: 1500000,
      },
      {
        id: 'to-direct-expense',
        source: joint.id,
        target: 'direct-expense',
        min: 800000,
        max: 800000,
      },
      {
        id: 'to-chained-expense',
        source: 'next-account',
        target: 'chained-expense',
        min: 1200000,
        max: 1500000,
      },
    ],
  });

  await page.getByRole('button', { name: '자동 정렬' }).click();

  const card = (id: string) => page.locator(`[data-id="${id}"] .money-node`);
  const cards = await Promise.all(
    [
      incomeA.id,
      incomeB.id,
      joint.id,
      'next-account',
      'direct-expense',
      'chained-expense',
    ].map((id) => bounds(card(id))),
  );
  const [first, second, merge, account, direct, chained] = cards;
  expect(first.x).toBeCloseTo(second.x, 0);
  expect(first.x + first.width).toBeLessThan(merge.x);
  expect(second.x + second.width).toBeLessThan(merge.x);
  expect(centerY(first)).toBeLessThan(centerY(merge));
  expect(centerY(second)).toBeGreaterThan(centerY(merge));
  expect(merge.x + merge.width).toBeLessThan(account.x);
  expect(direct.x).toBeCloseTo(account.x, 0);
  expect(direct.y).toBeGreaterThan(account.y + account.height);
  expect(chained.x).toBeGreaterThan(account.x + account.width);
  expect(centerY(chained)).toBeCloseTo(centerY(account), 0);

  for (const [group, members] of [
    [groupA, [first]],
    [groupB, [second]],
    [downstreamGroup, [account, direct, chained]],
  ] as const) {
    const region = await bounds(page.locator(`[data-id="group:${group.id}"]`));
    for (const member of members) {
      expect(member.x).toBeGreaterThan(region.x);
      expect(member.x + member.width).toBeLessThan(region.x + region.width);
      expect(member.y).toBeGreaterThan(region.y);
      expect(member.y + member.height).toBeLessThan(region.y + region.height);
    }
    expect(overlaps(merge, region)).toBe(false);
  }

  await expect(page.locator('.react-flow__edge')).toHaveCount(5);
  const labels = page.locator('.edge-label');
  await expect(labels).toHaveCount(5);
  const boxes = [
    ...cards,
    ...(await Promise.all((await labels.all()).map(bounds))),
  ];
  for (const [index, box] of boxes.entries()) {
    for (const other of boxes.slice(index + 1)) {
      expect(overlaps(box, other)).toBe(false);
    }
  }
});
