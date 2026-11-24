import { example } from '../src/app/example';
import { openExample } from './exampleFixture';
import { test, expect, type Locator } from '@playwright/test';
import { connect, point, selectNode } from './gestures';
test('빈 캔버스에서 급여 → 계좌 → 생활비를 그리고 금액·배치·삭제를 되돌린다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto('/');
  await expect(page.getByRole('main', { name: '새 자금 흐름' })).toBeVisible();
  await expect(page.locator('.react-flow__node-money')).toHaveCount(0);
  await expect(page.locator('.react-flow__node-region')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  for (const [type, name] of [
    ['수입', '급여'],
    ['계좌', '공동 계좌'],
    ['지출', '생활비'],
  ]) {
    await page.getByRole('button', { name: type + ' 추가' }).click();
    await page.getByLabel('이름', { exact: true }).fill(name);
    await page.getByLabel('이름', { exact: true }).press('Enter');
  }
  const node = (name: string) =>
    page
      .locator('.react-flow__node-money')
      .filter({ has: page.getByText(name, { exact: true }) });
  const account = node('공동 계좌');
  await connect(page, node('급여'), account);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await connect(page, account, node('생활비'));
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(
    page.getByRole('heading', { name: '연결선 상세' }),
  ).toBeVisible();
  const path = page.locator('.transfer-visual[data-selected] .transfer-shaft');
  const initialShape = await path.getAttribute('d');
  await page.getByLabel('금액 방식').selectOption('range');
  await page.getByLabel('월 최소 금액').fill('500000');
  await page.getByLabel('월 최대 금액').fill('800000');
  await page.getByLabel('월 최대 금액').press('Enter');
  await expect(
    page.locator('.edge-label').filter({ hasText: '50~80만' }),
  ).toBeVisible();
  await expect(path).not.toHaveAttribute('d', initialShape!);
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(page.getByLabel('월 금액 (원)')).toHaveValue('0');
  await page.getByRole('button', { name: '다시 실행' }).click();
  await expect(page.getByLabel('월 최대 금액')).toHaveValue('800000');
  await selectNode(account);
  await expect(
    page
      .getByRole('complementary', { name: '속성 패널' })
      .getByText('500,000원 ~ 800,000원', { exact: true }),
  ).toBeVisible();
  const before = await account.evaluate((el) => el.style.transform);
  const start = await point(account);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y + 55, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() => account.evaluate((el) => el.style.transform))
    .not.toBe(before);
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect
    .poll(() => account.evaluate((el) => el.style.transform))
    .toBe(before);
  await page.getByRole('button', { name: '선택 삭제' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
});

test('여러 노드를 함께 이동·삭제하고 입력 중 삭제 키는 글자에만 적용한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await openExample(page);
  const a = page.locator('[data-id="income-a"]');
  const b = page.locator('[data-id="income-b"]');
  await selectNode(a);
  const name = page.getByLabel('이름', { exact: true });
  await name.fill('급여!');
  await name.press('Backspace');
  await name.press('Enter');
  await expect(a).toContainText('급여');
  await selectNode(b, { modifiers: ['Control'] });
  await expect(
    page.getByRole('heading', { name: '2개 객체 선택' }),
  ).toBeVisible();
  const position = (n: Locator) => n.evaluate((e) => e.style.transform);
  const beforeA = await position(a);
  const beforeB = await position(b);
  const start = await point(a);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 44, start.y + 65, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => position(a)).not.toBe(beforeA);
  await expect.poll(() => position(b)).not.toBe(beforeB);
  await page.keyboard.press('Control+z');
  await expect.poll(() => position(a)).toBe(beforeA);
  await expect.poll(() => position(b)).toBe(beforeB);
  await page.keyboard.press('Delete');
  await expect(page.locator('.react-flow__node-money')).toHaveCount(5);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node-money')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});

test('중복 연결을 거부하고 금융사 등록과 연결선 삭제를 각각 복구한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await openExample(page);
  const income = page.locator('[data-id="income-a"]');
  const account = page.locator('[data-id="joint"]');
  const sourcePort = income.locator('.source');
  await expect(account.locator('.target')).toHaveCount(1);
  await expect(account.locator('.source')).toHaveCount(1);
  const accountPort = account.locator('.target');
  const cardPort = page.locator('[data-id="card"] .target').first();
  await expect(sourcePort).toHaveCSS('opacity', '0');
  const sourceCard = (await income.locator('.money-node > svg').boundingBox())!;
  const targetCard = (await account
    .locator('.money-node > svg')
    .boundingBox())!;
  const sourceHandle = (await sourcePort.boundingBox())!;
  const targetHandle = (await accountPort.boundingBox())!;
  expect(sourceHandle.x).toBeGreaterThanOrEqual(
    sourceCard.x + sourceCard.width - 0.5,
  );
  expect(targetHandle.x + targetHandle.width).toBeLessThanOrEqual(
    targetCard.x + 0.5,
  );
  const from = await point(sourcePort);
  const to = await point(accountPort);
  await page.mouse.move(from.x + 24, from.y);
  await expect(sourcePort).toHaveCSS('opacity', '0');
  await page.mouse.move(from.x, from.y);
  await expect(sourcePort).toHaveCSS('opacity', '1');
  await expect(accountPort).toHaveCSS('opacity', '0');
  await page.mouse.down();
  await page.mouse.move(from.x + 25, from.y, { steps: 4 });
  await expect(account).toHaveClass(/invalid-target/);
  await expect(accountPort).toHaveCSS('opacity', '0');
  await expect(cardPort).toHaveCSS('opacity', '1');
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(cardPort).toHaveCSS('opacity', '0');
  await income.hover();
  await sourcePort.click();
  await expect(cardPort).toHaveCSS('opacity', '1');
  await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
  await expect(cardPort).toHaveCSS('opacity', '0');
  await selectNode(account);
  await page.getByRole('button', { name: '+ 금융사 등록' }).click();
  await page.getByLabel('새 금융사 이름').fill('우리 동네 은행');
  await page.getByRole('button', { name: '등록 후 적용' }).click();
  const bank = page.getByLabel('금융사', { exact: true });
  await expect(bank).toHaveValue('우리 동네 은행');
  await expect(account).not.toContainText('우리 동네 은행');
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(bank).toHaveValue('카카오뱅크');
  await expect(account).not.toContainText('카카오뱅크');
  await page.locator('.react-flow__edge[data-id="salary-a"]').press('Enter');
  await page.getByLabel('월 금액 (원)').fill('-5');
  await page.getByLabel('월 금액 (원)').press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.locator('.edge-label').filter({ hasText: '320만' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '선택 삭제' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});

test('카드에서 이름과 유형을 편집하고 연결 제한과 실행 취소를 적용한다', async ({
  page,
}) => {
  await openExample(page);
  const node = page.locator('[data-id="joint"]');
  await selectNode(node);
  const edit = node.getByRole('button', { name: /이름 수정$/ });
  await edit.click();
  const name = node.getByRole('textbox', { name: '카드 이름' });
  await expect(name).toBeFocused();
  await name.fill('가계 통장');
  await name.press('Enter');
  await expect(node).toHaveAttribute('aria-label', '가계 통장');
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue(
    '가계 통장',
  );

  await node.getByRole('button', { name: '계좌 유형 수정' }).click();
  await node.getByRole('button', { name: '수입', exact: true }).click();
  await expect(node.getByRole('alert')).toContainText('연결선');
  await node.getByRole('button', { name: '카드', exact: true }).click();
  await expect(node.locator('.lucide-credit-card')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^유형/ })).toHaveValue(
    'card',
  );
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(node.locator('.lucide-landmark')).toBeVisible();

  await edit.click();
  await name.fill('취소할 이름');
  await name.press('Escape');
  await expect(name).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(node).toHaveAttribute('aria-label', '가계 통장');
  await edit.click();
  await name.fill('포커스를 벗어나 저장');
  await name.press('Tab');
  await expect(node).toHaveAttribute('aria-label', '포커스를 벗어나 저장');
});

test('자동 정렬은 흐름 방향과 그룹 소속을 유지하고 한 번에 되돌릴 수 있다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await openExample(page);
  const income = page.locator('[data-id="income-a"]');
  const partner = page.locator('[data-id="income-b"]');
  const account = page.locator('[data-id="joint"]');
  const card = page.locator('[data-id="card"]');
  const savings = page.locator('[data-id="savings"]');
  const group = page.locator('[data-id="group:joint-area"]');
  const transforms = () =>
    Promise.all(
      [income, partner, account, card, savings, group].map((node) =>
        node.evaluate((element) =>
          new DOMMatrixReadOnly(getComputedStyle(element).transform).toJSON(),
        ),
      ),
    );
  await expect(group).toBeVisible();
  const zoom = page.getByLabel('확대 비율');
  const initialZoom = await zoom.innerText();
  await page.getByRole('button', { name: '축소' }).click();
  await expect(zoom).not.toHaveText(initialZoom);
  const zoomBeforeArrange = await zoom.innerText();
  const before = await transforms();
  const arrange = page.getByRole('button', { name: '자동 정렬' });
  await arrange.click();
  await expect.poll(transforms).not.toEqual(before);
  await expect(zoom).toHaveText(zoomBeforeArrange);
  const [left, second, middle, right, saving, region] = await transforms();
  expect(left.e).toBe(second.e);
  expect(left.f).not.toBe(second.f);
  expect(right.e).toBe(saving.e);
  expect(right.f).toBeLessThan(saving.f);
  expect(left.e).toBeLessThan(middle.e);
  expect(middle.e).toBeLessThan(right.e);
  expect(middle.e).toBeGreaterThan(region.e);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await selectNode(account);
  await expect(
    page.locator('.property').filter({ hasText: '소속 그룹' }),
  ).toContainText('공동 자금');
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect.poll(transforms).toEqual(before);
});

test('선택 노드를 복사하면 내부 연결과 함께 붙여넣고 한 번에 되돌린다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await openExample(page);
  const income = page.locator('[data-id="income-a"]');
  const account = page.locator('[data-id="joint"]');
  const nodes = page.locator('.react-flow__node-money');
  const edges = page.locator('.react-flow__edge');
  const paste = page.getByRole('button', { name: '노드 붙여넣기' });
  await expect(paste).toBeDisabled();
  await selectNode(income);
  await selectNode(account, { modifiers: ['Control'] });
  await page.keyboard.press('Control+c');
  await expect(paste).toBeEnabled();
  await page.keyboard.press('Control+v');
  await expect(nodes).toHaveCount(9);
  await expect(edges).toHaveCount(7);
  await expect(nodes.filter({ hasText: '급여 A' })).toHaveCount(2);
  await expect(page.locator('.react-flow__node-money.selected')).toHaveCount(2);
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(nodes).toHaveCount(7);
  await expect(edges).toHaveCount(6);

  await selectNode(income);
  const name = page.getByLabel('이름', { exact: true });
  await name.focus();
  await name.press('Control+v');
  await expect(nodes).toHaveCount(7);
  await page.getByRole('button', { name: '선택 노드 복사' }).click();
  await page.getByRole('button', { name: '새 흐름' }).click();
  await paste.click();
  await expect(nodes).toHaveCount(1);
  await expect(nodes.first()).toContainText('급여 A');
  await expect(edges).toHaveCount(0);
});

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
