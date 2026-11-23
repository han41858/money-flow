import { test, expect, type Locator } from '@playwright/test';
import { connect, point, selectNode } from './gestures';
test('빈 캔버스에서 급여 → 계좌 → 생활비를 그리고 금액·배치·삭제를 되돌린다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto('/');
  await page.getByRole('button', { name: '새 흐름' }).click();
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
  const path = page.locator(
    '.react-flow__edge.selected .react-flow__edge-path',
  );
  const width = await path.evaluate((e) => getComputedStyle(e).strokeWidth);
  await page.getByLabel('금액 방식').selectOption('range');
  await page.getByLabel('월 최소 금액').fill('500000');
  await page.getByLabel('월 최대 금액').fill('800000');
  await page.getByLabel('월 최대 금액').press('Enter');
  await expect(
    page.locator('.edge-label').filter({ hasText: '50~80만' }),
  ).toBeVisible();
  await expect
    .poll(() => path.evaluate((e) => getComputedStyle(e).strokeWidth))
    .not.toBe(width);
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
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
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
});
