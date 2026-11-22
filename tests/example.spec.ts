import { test, expect } from '@playwright/test';
import { selectNode } from './gestures';
test('예제의 월간 자금 흐름을 탐색한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.workspace-title')).toHaveText('자금 흐름');
  const main = page.getByRole('main', { name: '우리 집 자금 흐름' });
  await expect(main).toBeVisible();
  await expect(main.getByText('월간 계획', { exact: true })).toHaveCount(0);
  await expect(
    main.getByText('우리 집 자금 흐름', { exact: true }),
  ).toHaveCount(0);
  const navigation = page.getByRole('complementary', {
    name: '다이어그램 탐색',
  });
  await expect(navigation.getByText('노드 7개 · 연결 6개')).toBeVisible();
  await expect(navigation.getByRole('status')).toHaveText(
    '이 브라우저에 저장됨',
  );
  await expect(
    main.getByText(/노드의 연결점을 끌거나|노드 7개|이 브라우저에 저장됨/),
  ).toHaveCount(0);
  const nodes = page.locator('.react-flow__node-money');
  const edges = page.locator('.react-flow__edge');
  await expect(nodes).toHaveCount(7);
  await expect(nodes.filter({ hasText: '급여 A' })).toBeVisible();
  await expect(nodes.filter({ hasText: '급여 B' })).toBeVisible();
  await expect(page.locator('.react-flow__node-region')).toHaveText([
    '개인 A',
    '개인 B',
    '공동 자금',
  ]);
  await expect(edges).toHaveCount(6);
  for (const node of await nodes.all()) await expect(node).toBeInViewport();
  await selectNode(nodes.filter({ hasText: '공동 생활비 통장' }));
  const sidebar = page.getByRole('complementary', { name: '속성 패널' });
  await expect(sidebar.getByText('5,600,000원')).toBeVisible();
  await sidebar.getByRole('button', { name: '생활비 카드' }).click();
  await expect(
    sidebar.getByRole('heading', { name: '연결선 상세' }),
  ).toBeVisible();
  await expect(sidebar.getByLabel('월 최소 금액 (원)')).toHaveValue('1280000');
  await sidebar.getByRole('button', { name: '속성 닫기' }).click();
  const zoom = page.getByLabel('확대 비율');
  const initial = await zoom.innerText();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await expect(zoom).not.toHaveText(initial);
  await page.getByRole('button', { name: '전체 보기' }).click();
  await expect(zoom).toHaveText(initial);
  await page.getByRole('button', { name: '격자 표시' }).click();
  await expect(page.locator('.react-flow__background')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('좁은 화면에서도 예제와 노드 속성을 조회한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  const account = page
    .locator('.react-flow__node-money')
    .filter({ hasText: '공동 생활비 통장' });
  await expect(account).toBeInViewport();
  await selectNode(account);
  await expect(
    page.getByRole('heading', { name: '공동 생활비 통장' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '속성 닫기' }).click();
  await page.getByRole('button', { name: '노드 목록 열기' }).click();
  const tools = page.getByRole('dialog', { name: '편집 도구' });
  await expect(tools.getByText('노드 7개 · 연결 6개')).toBeVisible();
  await expect(tools.getByRole('status')).toHaveText('이 브라우저에 저장됨');
  await page.getByRole('button', { name: '정기 적금', exact: true }).click();
  await expect(page.getByRole('heading', { name: '정기 적금' })).toBeVisible();
  await page.getByRole('button', { name: '속성 닫기' }).click();
  await expect(
    page.getByRole('complementary', { name: '속성 패널' }),
  ).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test('억 단위 수입 범위와 대출 상환을 월간 요약과 연결선에 반영한다', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.react-flow__edge[data-id="salary-a"]').press('Enter');
  await page.getByLabel('금액 방식').selectOption('range');
  await page.getByLabel('월 최소 금액').fill('100000000');
  await page.getByLabel('월 최대 금액').fill('200000000');
  await page.getByLabel('월 최대 금액').press('Enter');
  await expect(
    page.locator('.edge-label').filter({ hasText: '1억~2억' }),
  ).toBeVisible();
  await expect(page.locator('.metric.income')).toContainText(
    '1억 240만~2억 240만원',
  );
  await page.getByRole('button', { name: '정기 적금', exact: true }).click();
  await page.getByRole('combobox', { name: /^분류/ }).selectOption('loan');
  await expect(page.locator('.metric.loan')).toContainText('100만원');
  await expect(page.locator('.metric.save')).toContainText('0원');
  await page.getByRole('combobox', { name: /^분류/ }).selectOption('saving');
  await expect(page.locator('.metric.loan')).toHaveCount(0);
});
