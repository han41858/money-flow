import { chooseSavedFlow, openExample } from './exampleFixture';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { point, selectNode } from './gestures';
import { example } from '../src/app/example';
import { newGroupBounds } from '../src/features/groups/geometry';
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const b = (await handle.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 14 });
  await page.mouse.up();
}
test('그룹 편집·드래그·리사이즈·삭제 뒤 노드와 그룹 간 연결을 유지한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const salary = example.nodes.find((node) => node.id === 'income-a')!;
  const group = {
    ...newGroupBounds([salary], new Map(), salary.position),
    id: 'salary-region',
    parentId: salary.groupId,
    name: '새 그룹',
    color: '#92ab86',
  };
  await openExample(page, {
    ...example,
    groups: [...example.groups, group],
    nodes: example.nodes.map((node) =>
      node === salary ? { ...node, groupId: group.id } : node,
    ),
  });
  const income = page.locator('[data-id="income-a"]');
  const groupId = await page
    .locator('.react-flow__node-region')
    .filter({ hasText: '새 그룹' })
    .getAttribute('data-id');
  const title = page.locator(`[data-id="${groupId}"] .group-title`);
  await title.getByRole('button', { name: '새 그룹 이름 수정' }).click();
  const name = title.getByRole('textbox', { name: '캔버스 그룹 이름' });
  await expect(name).toBeFocused();
  await expect(page.getByLabel('그룹 이름', { exact: true })).toHaveValue(
    '새 그룹',
  );
  await name.fill('취소할 이름');
  await name.press('Escape');
  await expect(
    title.getByRole('button', { name: '새 그룹 이름 수정' }),
  ).toBeFocused();
  await title.getByRole('button', { name: '새 그룹 이름 수정' }).click();
  await name.fill('급여 영역');
  await name.press('Enter');
  await expect(page.getByLabel('그룹 이름', { exact: true })).toHaveValue(
    '급여 영역',
  );
  await page.getByLabel('배경색').fill('#7788bb');
  const region = page
    .locator('.react-flow__node-region')
    .filter({ hasText: '급여 영역' });
  const path = page.locator('[data-id="salary-a"] .react-flow__edge-path');
  const oldPath = await path.getAttribute('d');
  const before = (await income.boundingBox())!;
  const groupBefore = (await region.boundingBox())!;
  await drag(page, region.locator('.group-title'), 40, 18);
  await expect(name).toHaveCount(0);
  const dx = (await region.boundingBox())!.x - groupBefore.x;
  expect(dx).toBeGreaterThan(30);
  expect((await income.boundingBox())!.x - before.x).toBeCloseTo(dx, 0);
  await expect(path).not.toHaveAttribute('d', oldPath!);
  const width = await page.getByLabel('너비 (px)').inputValue();
  await drag(page, region.locator('.group-size-handle'), 35, 22);
  await expect(page.getByLabel('너비 (px)')).not.toHaveValue(width);
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(page.getByLabel('너비 (px)')).toHaveValue(width);
  await page.getByRole('button', { name: '다시 실행' }).click();
  await page
    .getByRole('status')
    .filter({ hasText: '이 브라우저에 저장됨' })
    .waitFor();
  await page.reload();
  await chooseSavedFlow(page, '우리 집 자금 흐름');
  await region.locator('.group-title svg').click();
  await expect(page.getByLabel('배경색')).toHaveValue('#7788bb');
  const pos = (await income.boundingBox())!;
  await page.getByRole('button', { name: '선택 삭제' }).click();
  await expect(region).toHaveCount(0);
  await expect
    .poll(async () => Math.round((await income.boundingBox())!.x - pos.x))
    .toBe(0);
  await selectNode(income);
  await expect(
    page.locator('.property').filter({ hasText: '소속 그룹' }),
  ).toContainText('개인 A');
  await expect(page.getByLabel('소유자')).toHaveCount(0);
  await page.locator('.react-flow__edge[data-id="salary-a"]').press('Enter');
  await expect(
    page.getByRole('heading', { name: '연결선 상세' }),
  ).toBeVisible();
});

test('기존 노드를 선택해도 새 그룹은 빈 공간에 생기고 노드 소속은 유지된다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openExample(page);
  const salary = page.locator('[data-id="income-a"]');
  await selectNode(salary);
  await page.getByRole('button', { name: '그룹 추가' }).click();
  const region = page
    .locator('.react-flow__node-region')
    .filter({ hasText: '새 그룹' });
  await expect(region).toHaveCount(1);
  await expect
    .poll(async () => {
      const group = (await region.boundingBox())!;
      const cards = await page.locator('.react-flow__node-money').all();
      for (const card of cards) {
        const node = (await card.boundingBox())!;
        if (
          group.x < node.x + node.width &&
          node.x < group.x + group.width &&
          group.y < node.y + node.height &&
          node.y < group.y + group.height
        )
          return true;
      }
      return false;
    })
    .toBe(false);
  const name = example.nodes.find((node) => node.id === 'income-a')!.name;
  await page.locator('.node-row').filter({ hasText: name }).click();
  await expect(
    page.locator('.property').filter({ hasText: '소속 그룹' }),
  ).toContainText('개인 A');
});

test('Ctrl+C와 Ctrl+V로 그룹, 하위 그룹, 소속 노드를 같은 상대 위치에 붙여넣는다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const [income, , account] = example.nodes;
  const color = '#92ab86';
  await openExample(page, {
    ...example,
    groups: [
      {
        id: 'copy-root',
        name: '상위 그룹',
        color,
        position: { x: 60, y: 80 },
        width: 550,
        height: 310,
      },
      {
        id: 'copy-child',
        parentId: 'copy-root',
        name: '하위 그룹',
        color,
        position: { x: 320, y: 130 },
        width: 260,
        height: 210,
      },
    ],
    nodes: [
      { ...income, groupId: 'copy-root', position: { x: 90, y: 160 } },
      { ...account, groupId: 'copy-child', position: { x: 345, y: 200 } },
    ],
    edges: [example.edges[0]],
  });
  const originals = [
    'group:copy-root',
    'group:copy-child',
    income.id,
    account.id,
  ].map((id) => page.locator(`.react-flow__node[data-id="${id}"]`));
  await originals[0].locator('.group-title svg').click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  const regions = page.locator('.react-flow__node-region');
  const cards = page.locator('.react-flow__node-money');
  await expect(regions).toHaveCount(4);
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  const copies = [
    page
      .locator('.react-flow__node-region:not([data-id="group:copy-root"])')
      .filter({ hasText: '상위 그룹' }),
    page
      .locator('.react-flow__node-region:not([data-id="group:copy-child"])')
      .filter({ hasText: '하위 그룹' }),
    page
      .locator(`.react-flow__node-money:not([data-id="${income.id}"])`)
      .filter({ hasText: income.name }),
    page
      .locator(`.react-flow__node-money:not([data-id="${account.id}"])`)
      .filter({ hasText: account.name }),
  ];
  const before = await Promise.all(originals.map((item) => item.boundingBox()));
  const after = await Promise.all(copies.map((item) => item.boundingBox()));
  for (const [i, box] of after.entries()) {
    expect(box!.x - after[0]!.x).toBeCloseTo(before[i]!.x - before[0]!.x, 0);
    expect(box!.y - after[0]!.y).toBeCloseTo(before[i]!.y - before[0]!.y, 0);
  }
});

test('그룹 안에 만든 계좌가 즉시 함께 이동하고 금융사 선택은 유형 변경 후에도 보존된다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto('/');
  await page.getByRole('button', { name: '새 흐름' }).click();
  await page.getByRole('button', { name: '그룹 추가' }).click();
  await page.getByRole('button', { name: '속성 닫기' }).click();
  await page.getByRole('button', { name: '계좌 추가' }).click();
  const bank = page.getByLabel('금융사', { exact: true });
  await expect(bank).toHaveValue('');
  await expect(
    page.locator('.property').filter({ hasText: '소속 그룹' }),
  ).toContainText('새 그룹');
  await bank.fill('신한은행');
  await bank.press('Enter');
  const type = page.getByRole('combobox', { name: /^유형/ });
  for (const kind of ['card', 'income', 'account']) {
    await type.selectOption(kind);
    await expect(bank).toHaveValue('신한은행');
  }
  await bank.fill('');
  await bank.press('Enter');
  const account = page.locator('.react-flow__node-money');
  await expect(bank).toHaveValue('');
  await expect(account).not.toContainText('금융사 미지정');
  const group = page.locator('.group-title');
  const before = (await account.boundingBox())!;
  await drag(page, group, 55, 25);
  expect((await account.boundingBox())!.x - before.x).toBeGreaterThan(40);
});

test('모바일에서 그룹 이름을 누르면 속성 모달 없이 편집한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page);
  const region = page.locator('[data-id="group:personal-a"]');
  await region.getByRole('button', { name: '개인 A 이름 수정' }).click();
  await expect(region).toHaveClass(/selected/);
  const name = region.getByRole('textbox', { name: '캔버스 그룹 이름' });
  await expect(name).toBeFocused();
  await expect(name).toHaveCSS('font-size', '16px');
  await expect(
    page.getByRole('dialog', { name: '선택한 객체 속성' }),
  ).toHaveCount(0);
  await name.fill('새 개인 그룹');
  await name.press('Enter');
  await expect(
    region.getByRole('button', { name: '새 개인 그룹 이름 수정' }),
  ).toBeVisible();
});

test('그룹을 일부 겹치거나 완전히 넣고 놓으면 소속에 따라 노드와 하위 그룹이 이동한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const [income, , account] = example.nodes;
  const [seed] = example.groups;
  await openExample(page, {
    ...example,
    groups: [
      {
        ...seed,
        id: 'leaf',
        name: '세부 항목',
        parentId: 'inner',
        position: { x: 505, y: 200 },
        width: 130,
        height: 105,
      },
      {
        ...seed,
        id: 'outer',
        name: '공동 자금',
        position: { x: 50, y: 90 },
        width: 360,
        height: 360,
      },
      {
        ...seed,
        id: 'inner',
        name: '생활비',
        position: { x: 470, y: 140 },
        width: 230,
        height: 220,
      },
    ],
    nodes: [
      { ...income, groupId: 'leaf', position: { x: 528, y: 240 } },
      { ...account, groupId: undefined, position: { x: 810, y: 220 } },
    ],
    edges: [example.edges[0]],
  });

  const outer = page.locator('[data-id="group:outer"]');
  const inner = page.locator('[data-id="group:inner"]');
  const leaf = page.locator('[data-id="group:leaf"]');
  const salary = page.locator('[data-id="income-a"]');
  const path = page.locator('.react-flow__edge-path');
  const zoom =
    Number.parseInt(await page.getByLabel('확대 비율').innerText(), 10) / 100;
  await drag(page, inner.locator('.group-title'), -110 * zoom, 0);
  const partial = (await inner.boundingBox())!;
  const root = (await outer.boundingBox())!;
  expect(partial.x).toBeLessThan(root.x + root.width);
  expect(partial.x + partial.width).toBeGreaterThan(root.x + root.width);
  await drag(page, outer.locator('.group-title'), 32, 0);
  expect((await inner.boundingBox())!.x).toBeCloseTo(partial.x, 0);
  await page.getByRole('button', { name: '실행 취소' }).click();

  await drag(page, inner.locator('.group-title'), -230 * zoom, 0);
  expect(
    (await inner.boundingBox())!.x + (await inner.boundingBox())!.width,
  ).toBeLessThan(root.x + root.width);
  const items = [outer, inner, leaf, salary];
  const before = await Promise.all(items.map((item) => item.boundingBox()));
  const originalPath = await path.getAttribute('d');
  const start = await point(outer.locator('.group-title'));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y + 22, { steps: 12 });
  await expect(path).not.toHaveAttribute('d', originalPath!);
  const whileDragging = await Promise.all(
    items.map((item) => item.boundingBox()),
  );
  const dx = whileDragging[0]!.x - before[0]!.x;
  const dy = whileDragging[0]!.y - before[0]!.y;
  expect(dx).toBeGreaterThan(35);
  expect(dy).toBeGreaterThan(15);
  for (const [index, current] of whileDragging.entries()) {
    expect(current!.x - before[index]!.x).toBeCloseTo(dx, 0);
    expect(current!.y - before[index]!.y).toBeCloseTo(dy, 0);
  }
  await page.mouse.up();
  for (const [index, current] of (
    await Promise.all(items.map((item) => item.boundingBox()))
  ).entries()) {
    expect(current!.x).toBeCloseTo(whileDragging[index]!.x, 0);
    expect(current!.y).toBeCloseTo(whileDragging[index]!.y, 0);
  }

  await drag(page, inner.locator('.group-title'), 240 * zoom, 0);
  const detached = (await inner.boundingBox())!;
  await drag(page, outer.locator('.group-title'), 35, 0);
  expect((await inner.boundingBox())!.x).toBeCloseTo(detached.x, 0);
  await page.getByRole('button', { name: '실행 취소' }).click();
  await page.getByRole('button', { name: '실행 취소' }).click();

  await page.getByRole('button', { name: '자동 정렬' }).click();
  for (const [parent, child] of [
    [outer, inner],
    [inner, leaf],
    [leaf, salary],
  ]) {
    const a = (await parent.boundingBox())!;
    const b = (await child.boundingBox())!;
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.x + b.width).toBeLessThan(a.x + a.width);
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.y + b.height).toBeLessThan(a.y + a.height);
  }
  await page
    .getByRole('status')
    .filter({ hasText: '이 브라우저에 저장됨' })
    .waitFor();
  await page.reload();
  await chooseSavedFlow(page, example.name);
  const savedChild = (await inner.boundingBox())!;
  await drag(page, outer.locator('.group-title'), 35, 0);
  expect((await inner.boundingBox())!.x - savedChild.x).toBeGreaterThan(25);
});
