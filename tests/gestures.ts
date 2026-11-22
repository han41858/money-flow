import { expect, type Page, type Locator } from '@playwright/test';
export async function point(locator: Locator) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  if (!rect) throw Error('캔버스 요소의 위치를 찾을 수 없습니다.');
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
export async function connect(page: Page, source: Locator, target: Locator) {
  const from = await point(source.locator('.source').first());
  const to = await point(target.locator('.target').first());
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
}
