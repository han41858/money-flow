import { test, expect, type Page, type Locator } from '@playwright/test';
async function point(locator: Locator) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  if (!rect) throw Error('캔버스 요소의 위치를 찾을 수 없습니다.');
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
async function connect(page: Page, source: Locator, target: Locator) {
  const from = await point(source.locator('.source').first()),
    to = await point(target.locator('.target').first());
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
}
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
      .locator('.react-flow__node')
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
  const a = page.locator('[data-id="income-a"]'),
    b = page.locator('[data-id="income-b"]');
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
  const beforeA = await position(a),
    beforeB = await position(b);
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
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});

test('중복 연결을 거부하고 금융사 등록과 연결선 삭제를 각각 복구한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto('/');
  const income = page.locator('[data-id="income-a"]'),
    account = page.locator('[data-id="joint"]');
  const from = await point(income.locator('.source')),
    to = await point(account.locator('.target').first());
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
  await expect(account.getByText('우리 동네 은행')).toBeVisible();
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(account.getByText('카카오뱅크')).toBeVisible();
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
