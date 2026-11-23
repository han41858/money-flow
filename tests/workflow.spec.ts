import { chooseSavedFlow, openExample } from './exampleFixture';
import { test, expect } from '@playwright/test';
import { connect, point, selectNode } from './gestures';
test('새 가계 흐름을 작성하고 그룹·금액을 복원한 뒤 읽기 전용 링크와 이미지로 전달한다', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto('/');
  for (const [kind, name] of [
    ['수입', '급여 A'],
    ['계좌', '공동 통장'],
  ]) {
    await page.getByRole('button', { name: kind + ' 추가' }).click();
    await page.getByLabel('이름', { exact: true }).fill(name);
    await page.getByLabel('이름', { exact: true }).press('Enter');
  }
  const node = (name: string) =>
    page.locator('.react-flow__node-money').filter({ hasText: name });
  await connect(page, node('급여 A'), node('공동 통장'));
  const path = page.locator('.react-flow__edge-path');
  const initial = await path.evaluate((el) => getComputedStyle(el).strokeWidth);
  await page.getByLabel('월 금액 (원)').fill('2800000');
  await page.getByLabel('월 금액 (원)').press('Enter');
  await expect
    .poll(() => path.evaluate((el) => getComputedStyle(el).strokeWidth))
    .not.toBe(initial);
  for (const [member, name] of [
    ['급여 A', '개인 A'],
    ['공동 통장', '공동 자금'],
  ]) {
    await selectNode(node(member));
    await page.getByRole('button', { name: '그룹 추가' }).click();
    await page
      .getByRole('textbox', { name: '그룹 이름', exact: true })
      .fill(name);
    await page
      .getByRole('textbox', { name: '그룹 이름', exact: true })
      .press('Enter');
  }
  const handle = page.locator('.group-title').filter({ hasText: '공동 자금' });
  const start = await point(handle);
  const before = await point(node('공동 통장'));
  const oldPath = await path.getAttribute('d');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 65, start.y + 42, { steps: 15 });
  await page.mouse.up();
  expect((await point(node('공동 통장'))).x - before.x).toBeGreaterThan(50);
  await expect(path).not.toHaveAttribute('d', oldPath!);
  await page
    .getByRole('status')
    .filter({ hasText: '이 브라우저에 저장됨' })
    .waitFor();
  await page.reload();
  await chooseSavedFlow(page, '새 자금 흐름');
  await expect(handle).toBeVisible();
  await expect(page.getByText('280만', { exact: true })).toBeVisible();
  await selectNode(node('공동 통장'));
  await expect(
    page.locator('.property').filter({ hasText: '소속 그룹' }),
  ).toContainText('공동 자금');
  await page.getByRole('button', { name: '공유 및 내보내기' }).click();
  await page.getByRole('button', { name: '공유 링크 만들기' }).click();
  const url = await page.getByLabel('읽기 전용 주소').inputValue();
  const shared = await context.newPage();
  await shared.goto(url);
  await expect(shared.getByText('Money Flow · 읽기 전용')).toBeVisible();
  await shared
    .getByLabel('항목 찾기')
    .selectOption({ label: '급여 A → 공동 통장' });
  await expect(shared.getByRole('region', { name: '선택 상세' })).toContainText(
    '2,800,000원',
  );
  await shared.close();
  for (const format of ['SVG', 'PNG']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: format + ' 저장' }).click();
    expect((await download).suggestedFilename()).toBe(
      '새 자금 흐름.' + format.toLowerCase(),
    );
  }
  await page.getByRole('button', { name: '공유 창 닫기' }).click();
  await page.getByRole('button', { name: '내 흐름', exact: true }).click();
  await expect(page.locator('.library-list button')).toHaveCount(1);
});
test('키보드로 대상 노드 선택·연결·이동·실행 취소가 가능하다', async ({
  page,
}) => {
  await openExample(page);
  await page.getByRole('button', { name: '급여 A', exact: true }).focus();
  await page.keyboard.press('Enter');
  const select = page.getByLabel('연결할 노드');
  await select.focus();
  await select.press('Home');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '연결 추가' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: '연결선 상세' }),
  ).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  const salary = page.locator('[data-id="income-a"]');
  await salary.focus();
  await page.keyboard.press('Enter');
  const before = await salary.evaluate((el) => el.style.transform);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => salary.evaluate((el) => el.style.transform))
    .not.toBe(before);
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => salary.evaluate((el) => el.style.transform))
    .toBe(before);
});
test('320px 화면의 도구 패널이 포커스를 유지하고 Esc로 닫히며 공유 화면을 탐색한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openExample(page);
  const trigger = page.getByRole('button', { name: '노드 목록 열기' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const tools = page.getByRole('dialog', { name: '편집 도구' });
  await expect(tools).toBeVisible();
  await expect(tools.getByRole('button', { name: '탐색 닫기' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: '공유 및 내보내기' }).click();
  await page.getByRole('button', { name: '공유 링크 만들기' }).click();
  await page.goto(await page.getByLabel('읽기 전용 주소').inputValue());
  await page.getByLabel('항목 찾기').selectOption({ label: '생활비 카드' });
  await expect(page.getByRole('region', { name: '선택 상세' })).toContainText(
    '신한카드',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});
