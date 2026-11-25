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

test('빈 그룹을 추가해도 노드와 연결선은 그대로이고 빈 그룹은 각 범위의 마지막 열 뒤에 놓인다', async ({
  page,
  browser,
  baseURL,
}) => {
  const viewport = { width: 1600, height: 1000 };
  await page.setViewportSize(viewport);
  const withEmpty = await browser.newPage({ baseURL, viewport });
  const [seed, , parent] = example.groups;
  const empty = {
    ...seed,
    id: 'empty-first',
    name: '빈 그룹 A',
    position: { x: -250, y: -180 },
    width: 220,
    height: 140,
  };
  const cardSelector = (id: string) => `[data-id="${id}"] .money-node`;
  const groupSelector = (id: string) => `[data-id="group:${id}"]`;

  async function snapshot(canvas: typeof page) {
    await expect(canvas.locator('.react-flow__edge-path')).toHaveCount(
      example.edges.length,
    );
    return canvas.locator('.react-flow__viewport').evaluate(
      (viewport, cards) => {
        const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a;
        const boxes = cards.map((card) =>
          viewport.querySelector(card)!.getBoundingClientRect(),
        );
        const [anchor] = boxes;
        return {
          nodes: boxes.map(({ x, y }) => ({
            x: (x - anchor.x) / zoom,
            y: (y - anchor.y) / zoom,
          })),
          paths: Array.from(
            viewport.querySelectorAll('.react-flow__edge-path'),
            (path) => path.getAttribute('d'),
          ),
        };
      },
      example.nodes.map(({ id }) => cardSelector(id)),
    );
  }

  try {
    await openExample(page);
    await page.getByRole('button', { name: '자동 정렬' }).click();
    const before = await snapshot(page);

    await openExample(withEmpty, {
      ...example,
      groups: [
        ...example.groups,
        empty,
        {
          ...empty,
          id: 'empty-second',
          name: '빈 그룹 B',
          position: { x: -250, y: 40 },
          height: 100,
        },
        {
          ...empty,
          id: 'empty-child',
          name: '빈 하위 그룹',
          parentId: parent.id,
          position: { x: 400, y: 10 },
        },
      ],
    });
    await withEmpty.getByRole('button', { name: '자동 정렬' }).click();
    const after = await snapshot(withEmpty);
    for (const [index, node] of after.nodes.entries()) {
      expect(node.x).toBeCloseTo(before.nodes[index].x, 1);
      expect(node.y).toBeCloseTo(before.nodes[index].y, 1);
    }
    expect(after.paths).toEqual(before.paths);

    const group = (id: string) => bounds(withEmpty.locator(groupSelector(id)));
    const first = await group(empty.id);
    const second = await group('empty-second');
    const populated = await Promise.all(
      example.groups.map(({ id }) => group(id)),
    );
    expect(first.x).toBeGreaterThan(
      Math.max(...populated.map((box) => box.x + box.width)),
    );
    expect(second.x).toBeCloseTo(first.x, 1);
    expect(second.y).toBeGreaterThan(first.y + first.height);

    const child = await group('empty-child');
    const parentBox = await group(parent.id);
    const members = await Promise.all(
      example.nodes
        .filter(({ groupId }) => groupId === parent.id)
        .map(({ id }) => bounds(withEmpty.locator(cardSelector(id)))),
    );
    expect(child.x).toBeGreaterThan(
      Math.max(...members.map((box) => box.x + box.width)),
    );
    expect(child.x + child.width).toBeLessThan(parentBox.x + parentBox.width);
    expect(child.y).toBeGreaterThan(parentBox.y);
    expect(child.y + child.height).toBeLessThan(parentBox.y + parentBox.height);
  } finally {
    await withEmpty.close();
  }
});

test('앞쪽 부모 그룹이 빈 하위 그룹을 감싸도록 넓어지면 오른쪽 그룹과 노드를 함께 민다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const [parent, , downstream] = example.groups;
  const child = {
    ...parent,
    id: 'empty-child-before-downstream',
    name: '빈 하위 그룹',
    parentId: parent.id,
    position: { x: -200, y: 0 },
    width: 220,
    height: 100,
  };
  await openExample(page, { ...example, groups: [...example.groups, child] });
  await page.getByRole('button', { name: '자동 정렬' }).click();

  const group = (id: string) => bounds(page.locator(`[data-id="group:${id}"]`));
  const card = (id: string) =>
    bounds(page.locator(`[data-id="${id}"] .money-node`));
  const [parentBox, childBox, downstreamBox, source] = await Promise.all([
    group(parent.id),
    group(child.id),
    group(downstream.id),
    card(example.nodes[0].id),
  ]);
  expect(childBox.x).toBeGreaterThan(source.x + source.width);
  expect(childBox.x + childBox.width).toBeLessThan(
    parentBox.x + parentBox.width,
  );
  expect(childBox.y).toBeGreaterThan(parentBox.y);
  expect(childBox.y + childBox.height).toBeLessThan(
    parentBox.y + parentBox.height,
  );
  expect(downstreamBox.x).toBeGreaterThanOrEqual(parentBox.x + parentBox.width);
  for (const node of example.nodes.filter(
    ({ groupId }) => groupId === downstream.id,
  )) {
    const box = await card(node.id);
    expect(overlaps(box, parentBox)).toBe(false);
    expect(box.x).toBeGreaterThan(downstreamBox.x);
    expect(box.x + box.width).toBeLessThan(
      downstreamBox.x + downstreamBox.width,
    );
  }
});
