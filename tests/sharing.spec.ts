import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

async function share(page: Page) {
  await page.getByRole('button', { name: '공유 및 내보내기' }).click();
  await page.getByText('공유할 이름과 금액 확인').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('장현의 급여', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/3,200,000원/)).toBeVisible();
  await dialog.getByRole('button', { name: '공유 링크 만들기' }).click();
  const output = dialog.getByLabel('읽기 전용 주소');
  await expect(output).toHaveValue(/#share=1\./);
  return output.inputValue();
}
test('링크 열람·선택·확대는 저장소를 생성하지 않고 명시적 복사만 독립된 흐름을 저장한다', async ({
  page,
  browser,
  context,
}) => {
  await page.goto('/');
  const url = await share(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '링크 복사' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  const guest = await browser.newContext();
  const viewer = await guest.newPage();
  await viewer.goto(url);
  await expect(viewer.getByText('Money Flow · 읽기 전용')).toBeVisible();
  await viewer.locator('[data-id="income-a"]').click();
  await expect(viewer.getByRole('region', { name: '선택 상세' })).toContainText(
    '장현의 급여',
  );
  await viewer.locator('.edge-label').filter({ hasText: '320만' }).click();
  await expect(viewer.getByRole('region', { name: '선택 상세' })).toContainText(
    '3,200,000원',
  );
  await viewer.keyboard.press('Delete');
  await expect(viewer.locator('.react-flow__edge')).toHaveCount(6);
  await viewer.getByRole('button', { name: '확대', exact: true }).click();
  expect(await viewer.evaluate(() => indexedDB.databases())).toEqual([]);
  await viewer.getByRole('button', { name: '내 다이어그램으로 복사' }).click();
  await expect(
    viewer.getByRole('heading', { name: '우리 집 자금 흐름 복사본' }),
  ).toBeVisible();
  await viewer.getByRole('button', { name: '내 흐름', exact: true }).click();
  await expect(viewer.locator('.library-list button')).toHaveCount(1);
  await guest.close();
  await page.goto(url);
  await expect(page.getByText('Money Flow · 읽기 전용')).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: '내 흐름', exact: true }).click();
  await expect(page.locator('.library-list button')).toHaveCount(1);
  await expect(page.locator('.library-list')).toContainText(
    '우리 집 자금 흐름',
  );
});
test('손상된 공유 링크에서도 편집기를 열거나 로컬 데이터베이스를 만들지 않는다', async ({
  page,
}) => {
  await page.goto('/#share=1.broken');
  await expect(page.getByRole('alert')).toContainText('공유 링크');
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
});
test('화면 밖의 데이터까지 SVG와 두 배 크기 PNG로 내려받는다', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await page.getByRole('button', { name: '공유 및 내보내기' }).click();
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG 저장' }).click();
  const svgPath = info.outputPath('diagram.svg');
  await (await svgDownload).saveAs(svgPath);
  const svg = await readFile(svgPath, 'utf8');
  expect(svg).toContain('통신비');
  const [, width, height] = /<svg[^>]* width="(\d+)" height="(\d+)"/.exec(svg)!;
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG 저장' }).click();
  const png = await readFile((await (await pngDownload).path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(Number(width) * 2);
  expect(png.readUInt32BE(20)).toBe(Number(height) * 2);
});
