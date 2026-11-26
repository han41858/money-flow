import { example } from '../src/app/example';
import { openExample } from './exampleFixture';
import { test, expect, type Locator } from '@playwright/test';
import { connect } from './gestures';

test('새 흐름에서 수입 두 개를 자동 정렬하면 화면 중앙에 놓인다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const nodes = page.locator('.react-flow__node-money');
  const zoom = page.getByLabel('확대 비율');
  await expect(zoom).toHaveText('100%');
  await page.getByRole('button', { name: '수입 추가' }).click();
  await page.getByRole('button', { name: '수입 추가' }).click();
  await page.getByRole('button', { name: '계좌 추가' }).click();
  await expect(zoom).toHaveText('100%');
  const account = nodes.nth(2);
  await connect(page, nodes.nth(0), account);
  await connect(page, nodes.nth(1), account);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('button', { name: '자동 정렬' }).click();
  await expect
    .poll(async () => {
      const area = (await page.locator('.flow-area').boundingBox())!;
      const summary = (await page.locator('.metrics').boundingBox())!;
      const panel = await page.locator('.detail-wrap').boundingBox();
      const controls = (await page.locator('.canvas-controls').boundingBox())!;
      const boxes = await Promise.all(
        (await nodes.all()).map((node) => node.boundingBox()),
      );
      const x =
        (Math.min(...boxes.map((box) => box!.x)) +
          Math.max(...boxes.map((box) => box!.x + box!.width))) /
        2;
      const y =
        (Math.min(...boxes.map((box) => box!.y)) +
          Math.max(...boxes.map((box) => box!.y + box!.height))) /
        2;
      return Math.max(
        Math.abs(x - (area.x + (panel?.x ?? area.x + area.width)) / 2),
        Math.abs(y - (summary.y + summary.height + controls.y) / 2),
      );
    })
    .toBeLessThan(1);
  const [first, second, target] = await Promise.all(
    (await nodes.all()).map((node) => node.boundingBox()),
  );
  expect(first!.x).toBeCloseTo(second!.x, 0);
  expect(target!.x).toBeGreaterThan(first!.x + first!.width);
  await expect(zoom).toHaveText('100%');
  for (const node of await nodes.all()) await expect(node).toBeInViewport();

  await page.getByRole('button', { name: '카드 추가' }).click();
  const card = nodes.nth(3);
  await connect(page, account, card);
  await expect(account.locator('.node-totals')).toBeVisible();
  await expect(card.locator('.node-totals')).toHaveCount(0);
  await page.getByRole('button', { name: '자동 정렬' }).click();
  const body = (node: Locator) => node.locator('.money-node > svg');
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([
        body(account).boundingBox(),
        body(card).boundingBox(),
      ]);
      return Math.abs(a!.y - b!.y);
    })
    .toBeLessThan(1);
});

test('자동 정렬 결과가 편집 영역을 넘을 때만 전체가 보이도록 축소한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 850, height: 700 });
  await openExample(page);
  await page
    .getByRole('button', { name: '공동 생활비 통장', exact: true })
    .first()
    .click();
  const panel = page.locator('.detail-wrap');
  await expect(panel).toBeVisible();

  const zoom = page.getByLabel('확대 비율');
  await page.getByRole('button', { name: '100% 배율로 설정' }).click();
  await expect(zoom).toHaveText('100%');
  const arrange = page.getByRole('button', { name: '자동 정렬' });
  await arrange.click();
  await expect(zoom).not.toHaveText('100%');
  const fitted = await zoom.innerText();
  expect(parseInt(fitted, 10)).toBeLessThan(100);

  const area = (await page.locator('.flow-area').boundingBox())!;
  const summary = (await page.locator('.metrics').boundingBox())!;
  const inspector = (await panel.boundingBox())!;
  const objects = page.locator(
    '.react-flow__node-money, .react-flow__node-region',
  );
  for (const object of await objects.all()) {
    const box = (await object.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(area.x);
    expect(box.y).toBeGreaterThanOrEqual(summary.y + summary.height);
    expect(box.x + box.width).toBeLessThanOrEqual(inspector.x);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  }

  await page.setViewportSize({ width: 1536, height: 960 });
  await arrange.click();
  await expect(zoom).toHaveText(fitted);
});

test('노드 목록이 길어도 정렬한 노드가 브라우저 창 안에 보인다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExample(page, {
    ...example,
    nodes: [
      ...example.nodes,
      ...Array.from({ length: 24 }, (_, index) => ({
        ...example.nodes[0],
        id: 'extra-income-' + index,
        name: '추가 수입 ' + index,
      })),
    ],
  });
  const sidebar = page.locator('.sidebar');
  await expect
    .poll(() => sidebar.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: '100% 배율로 설정' }).click();
  const nodes = page.locator('.react-flow__node-money');
  await expect(nodes).toHaveCount(example.nodes.length + 24);
  const summary = (await page.locator('.metrics').boundingBox())!;
  const controls = (await page.locator('.canvas-controls').boundingBox())!;
  for (const name of ['자동 정렬', '전체 보기']) {
    await page.getByRole('button', { name }).click();
    for (const node of await nodes.all()) {
      const bounds = (await node.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(summary.y + summary.height - 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(controls.y + 1);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    900,
  );
});

test('자동 정렬과 전체 보기를 번갈아 눌러도 같은 뷰포트를 유지한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 850, height: 700 });
  await openExample(page);
  await page
    .getByRole('button', { name: '공동 생활비 통장', exact: true })
    .first()
    .click();
  await expect(page.locator('.detail-wrap')).toBeVisible();
  await page.getByRole('button', { name: '100% 배율로 설정' }).click();

  const arrange = page.getByRole('button', { name: '자동 정렬' });
  const center = page.getByRole('button', { name: '전체 보기' });
  const viewport = page.locator('.react-flow__viewport');
  await arrange.click();
  await expect(page.getByLabel('확대 비율')).not.toHaveText('100%');
  const transform = await viewport.getAttribute('style');
  for (const button of [center, arrange, center]) {
    await button.click();
    await expect(viewport).toHaveAttribute('style', transform!);
  }
});

for (const width of [1440, 390])
  test(`자동 정렬 후 합류·분기 금액이 겹치지 않는다 (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const nodes = [
      {
        id: 'income-a',
        type: 'income',
        name: '새 수입',
        position: { x: 0, y: 0 },
      },
      {
        id: 'income-b',
        type: 'income',
        name: '새 수입',
        position: { x: 0, y: 64 },
      },
      { id: 'joint', type: 'account', name: '새', position: { x: 150, y: 32 } },
      { id: 'card', type: 'card', name: '새 카드', position: { x: 300, y: 0 } },
      {
        id: 'living',
        type: 'expense',
        category: 'consumption',
        name: '새 지출',
        position: { x: 300, y: 64 },
      },
    ] satisfies typeof example.nodes;
    const links = [
      {
        id: 'salary-a',
        source: 'income-a',
        target: 'joint',
        min: 8_000_000,
        max: 8_000_000,
      },
      {
        id: 'salary-b',
        source: 'income-b',
        target: 'joint',
        min: 2_000_000,
        max: 2_000_000,
      },
      {
        id: 'card-payment',
        source: 'joint',
        target: 'card',
        min: 5_000_000,
        max: width === 390 ? 5_750_000 : 5_000_000,
      },
      { id: 'spending', source: 'joint', target: 'living', min: 0, max: 0 },
    ];
    await openExample(page, { ...example, groups: [], nodes, edges: links });
    const canvas = page.getByRole('main');
    await canvas.getByRole('button', { name: '100% 배율로 설정' }).click();
    await canvas.getByRole('button', { name: '자동 정렬' }).click();
    const labels = canvas.locator('.edge-label');
    await expect(labels).toHaveCount(links.length);
    for (const node of await canvas.locator('.react-flow__node-money').all())
      await expect(node).toBeInViewport();
    await expect(canvas.getByLabel('확대 비율')).toHaveText(
      width === 390 ? /^[1-9]?[0-9]%$/ : '100%',
    );

    const conflicts = await canvas
      .locator('.react-flow__edgelabel-renderer')
      .evaluate((renderer) => {
        const labels = [...renderer.querySelectorAll('.edge-label')];
        const arrows = [
          ...renderer.querySelectorAll<SVGGeometryElement>('.transfer-arrow'),
        ];
        const obstacles = [
          ...renderer.parentElement!.querySelectorAll(
            '.money-node > svg, .node-totals text',
          ),
        ];
        const overlaps = (a: DOMRect, b: DOMRect) =>
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        return labels.flatMap((label, index) => {
          const box = label.getBoundingClientRect();
          const otherLabels = labels.filter((other) => other !== label);
          const occupied = [...otherLabels, ...obstacles, ...arrows];
          const intersecting = occupied.filter((el) =>
            overlaps(box, el.getBoundingClientRect()),
          );
          const strokes = [
            ...renderer.querySelectorAll<SVGElement>('.transfer-visual'),
          ].filter((_, i) => i !== index);
          for (const edge of strokes) {
            for (const shape of edge.querySelectorAll<SVGGeometryElement>(
              '.transfer-body, .transfer-shaft',
            )) {
              const inverse = shape.getScreenCTM()!.inverse();
              for (const x of [
                box.left + 1,
                (box.left + box.right) / 2,
                box.right - 1,
              ])
                for (const y of [
                  box.top + 1,
                  (box.top + box.bottom) / 2,
                  box.bottom - 1,
                ]) {
                  const p = new DOMPoint(x, y).matrixTransform(inverse);
                  if (shape.isPointInFill(p) || shape.isPointInStroke(p))
                    intersecting.push(shape);
                }
            }
          }
          return intersecting.map((el) => [
            label.textContent,
            el.textContent || el.getAttribute('class'),
          ]);
        });
      });
    expect(conflicts).toEqual([]);

    await canvas.getByRole('button', { name: '8,000,000원 금액 수정' }).click();
    const input = canvas.getByRole('textbox', { name: '연결선 금액 (원)' });
    await input.fill('7900000');
    await input.press('Enter');
    await expect(
      canvas.getByRole('button', { name: '7,900,000원 금액 수정' }),
    ).toBeVisible();
  });

test('좁은 화면에서 500만 원 연결 두 개를 정렬해도 금액과 화살촉이 카드와 겹치지 않는다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page, {
    ...example,
    groups: [],
    nodes: example.nodes.slice(0, 3).map((node) => ({
      ...node,
      groupId: undefined,
    })),
    edges: example.edges.slice(0, 2).map((edge) => ({
      ...edge,
      min: 5_000_000,
      max: 5_000_000,
    })),
  });
  const canvas = page.getByRole('main');
  await canvas.getByRole('button', { name: '100% 배율로 설정' }).click();
  await canvas.getByRole('button', { name: '자동 정렬' }).click();
  const sources = canvas.locator('[data-id="income-a"], [data-id="income-b"]');
  const target = canvas.locator('[data-id="joint"]');
  const labels = canvas.getByRole('button', { name: '5,000,000원 금액 수정' });
  const arrows = canvas.locator('.transfer-arrow');
  await expect(target).toBeInViewport();
  await expect(labels).toHaveCount(2);
  await expect(arrows).toHaveCount(2);
  const sourceBoxes = await Promise.all(
    (await sources.all()).map((node) => node.boundingBox()),
  );
  const sourceRight = Math.max(
    ...sourceBoxes.map((box) => box!.x + box!.width),
  );
  const targetLeft = (await target.boundingBox())!.x;
  for (const item of [...(await labels.all()), ...(await arrows.all())]) {
    const box = (await item.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(sourceRight);
    expect(box.x + box.width).toBeLessThanOrEqual(targetLeft);
  }
});

for (const [title, diagram] of [
  ['범위 금액이 있는 예시를', example],
  [
    '단계를 건너뛰는 연결을',
    {
      ...example,
      groups: [],
      nodes: example.nodes
        .slice(0, 4)
        .map((node) => ({ ...node, groupId: undefined })),
      edges: [
        ...example.edges.slice(0, 3),
        { ...example.edges[0], id: 'skip', target: 'card' },
      ],
    },
  ],
] satisfies [string, typeof example][])
  test(`${title} 자동 정렬해도 금액이 카드와 겹치지 않는다`, async ({
    page,
  }) => {
    await openExample(page, diagram);
    const canvas = page.getByRole('main');
    await canvas.getByRole('button', { name: '100% 배율로 설정' }).click();
    await canvas.getByRole('button', { name: '자동 정렬' }).click();
    const labels = canvas.locator('.edge-label');
    await expect(labels).toHaveCount(diagram.edges.length);
    const boxes = (items: Locator[]) =>
      Promise.all(items.map(async (item) => (await item.boundingBox())!));
    const cards = await boxes(
      await canvas.locator('.react-flow__node-money').all(),
    );
    for (const label of await boxes(await labels.all()))
      for (const card of cards)
        expect(
          label.x + label.width <= card.x ||
            card.x + card.width <= label.x ||
            label.y + label.height <= card.y ||
            card.y + card.height <= label.y,
          JSON.stringify({ label, card }),
        ).toBe(true);
  });

test('노드 없이 그룹만 있어도 전체 보기가 그룹을 화면으로 가져온다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExample(page, {
    ...example,
    nodes: [],
    edges: [],
    groups: [{ ...example.groups[0], position: { x: 3000, y: 3000 } }],
  });
  await page.getByRole('button', { name: '전체 보기' }).click();
  const group = (await page.locator('.group-region').boundingBox())!;
  const canvas = (await page.locator('.flow-area').boundingBox())!;
  expect(group.x).toBeGreaterThan(canvas.x);
  expect(group.y).toBeGreaterThan(canvas.y);
  expect(group.x + group.width).toBeLessThan(canvas.x + canvas.width);
  expect(group.y + group.height).toBeLessThan(canvas.y + canvas.height);
});
