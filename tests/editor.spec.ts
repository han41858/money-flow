import { test, expect, type Locator } from '@playwright/test';
import { connect, point } from './gestures';
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
  await account.click();
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
  await a.click();
  const name = page.getByLabel('이름', { exact: true });
  await name.fill('급여!');
  await name.press('Backspace');
  await name.press('Enter');
  await expect(a).toContainText('급여');
  await b.click({ modifiers: ['Control'] });
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
  const from = await point(income.locator('.source'));
  const to = await point(account.locator('.target').first());
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 25, from.y, { steps: 4 });
  await expect(account).toHaveClass(/invalid-target/);
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await account.click();
  await page.getByRole('button', { name: '+ 금융사 등록' }).click();
  await page.getByLabel('새 금융사 이름').fill('우리 동네 은행');
  await page.getByRole('button', { name: '등록 후 적용' }).click();
  const bank = page.getByLabel('금융사', { exact: true });
  await expect(bank).toHaveValue('우리 동네 은행');
  await expect(account).not.toContainText('우리 동네 은행');
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(bank).toHaveValue('카카오뱅크');
  await expect(account).not.toContainText('카카오뱅크');
  await page.locator('.edge-label').filter({ hasText: '320만' }).click();
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
  await node.click();
  const edit = node.getByRole('button', { name: '카드에서 수정' });
  await edit.click();
  const name = node.getByRole('textbox', { name: '카드 이름' });
  await expect(name).toBeFocused();
  await name.fill('가계 통장');
  await node.getByText('수입', { exact: true }).click();
  const save = node.getByRole('button', { name: '카드 수정 저장' });
  await save.click();
  await expect(node.getByRole('alert')).toContainText('연결선');
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue(
    '공동 생활비 통장',
  );
  await node.getByText('카드', { exact: true }).click();
  await expect(
    node.getByRole('radio', { name: '카드', exact: true }),
  ).toBeChecked();
  await name.press('Enter');
  await expect(node).toHaveAttribute('aria-label', '가계 통장');
  await expect(node.locator('.lucide-credit-card')).toBeVisible();
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue(
    '가계 통장',
  );
  await expect(page.getByRole('combobox', { name: /^유형/ })).toHaveValue(
    'card',
  );
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(node).toHaveAttribute('aria-label', '공동 생활비 통장');
  await expect(node.locator('.lucide-landmark')).toBeVisible();
  await edit.click();
  await name.fill('취소할 이름');
  await name.press('Escape');
  await expect(name).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(node).toHaveAttribute('aria-label', '공동 생활비 통장');
});
