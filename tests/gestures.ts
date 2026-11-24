import { expect, type Page, type Locator } from '@playwright/test';
export async function point(locator: Locator) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  if (!rect) throw Error('캔버스 요소의 위치를 찾을 수 없습니다.');
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
export async function port(
  page: Page,
  node: Locator,
  type: 'source' | 'target',
) {
  const id = await node.getAttribute('data-id');
  if (!id) throw Error('연결점의 노드를 찾을 수 없습니다.');
  return page.locator(`.node-port.${type}[data-nodeid=${JSON.stringify(id)}]`);
}

export async function connect(page: Page, source: Locator, target: Locator) {
  await source.hover();
  const from = await point(await port(page, source, 'source'));
  const to = await point(await port(page, target, 'target'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
}

export async function selectNode(
  node: Locator,
  options?: Parameters<Locator['click']>[0],
) {
  // The center is the inline name editor. Click the upper padding to select.
  const rect = await node.boundingBox();
  if (!rect) throw Error('캔버스 요소의 위치를 찾을 수 없습니다.');
  await node.click({ ...options, position: { x: rect.width / 2, y: 2 } });
}
