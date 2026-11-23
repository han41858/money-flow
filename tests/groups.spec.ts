import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectNode } from './gestures';
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const b = (await handle.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 14 });
  await page.mouse.up();
}
test('그룹 생성·편집·드래그·리사이즈·삭제 뒤 노드와 그룹 간 연결을 유지한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  const income = page.locator('[data-id="income-a"]');
  await selectNode(income);
  await page.getByRole('button', { name: '그룹 추가' }).click();
  await page.getByRole('button', { name: '속성 닫기' }).click();
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
  ).toContainText('없음');
  await expect(page.getByLabel('소유자')).toHaveCount(0);
  await page.locator('.react-flow__edge[data-id="salary-a"]').press('Enter');
  await expect(
    page.getByRole('heading', { name: '연결선 상세' }),
  ).toBeVisible();
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
  await page.goto('/');
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
