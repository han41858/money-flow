import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

async function share(page: Page) {
  await page.getByRole('button', { name: '공유 및 내보내기' }).click();
  await page.getByText('공유할 이름과 금액 확인').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('본인의 급여', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/3,200,000원/)).toBeVisible();
  await dialog.getByRole('button', { name: '공유 링크 만들기' }).click();
  const output = dialog.getByLabel('읽기 전용 주소');
  await expect(output).toHaveValue(/#share=2\./);
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
  await viewer
    .locator('.react-flow__node-money')
    .filter({ hasText: '본인의 급여' })
    .click();
  await expect(viewer.getByRole('region', { name: '선택 상세' })).toContainText(
    '본인의 급여',
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

test('긴 이름의 줄·브랜드 배경·유형 아이콘과 화살촉이 캔버스와 SVG에서 일치한다', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: '공동 생활비 통장', exact: true })
    .click();
  const name = '가족의 월간 생활비와 교육비를 함께 관리하는 공동 계좌 '
    .repeat(2)
    .trim();
  await page.getByLabel('이름', { exact: true }).fill(name);
  await page.getByLabel('이름', { exact: true }).press('Enter');
  const card = page.locator('[data-id="joint"] .money-node > svg');
  const lines = await card
    .locator('text[font-size="18"] tspan')
    .allTextContents();
  expect(lines.length).toBeGreaterThan(1);
  const colors = await card
    .locator('stop')
    .evaluateAll((stops) => stops.map((s) => s.getAttribute('stop-color')));
  const icon = await card.locator('svg').getAttribute('class');
  const liveArrow = await page
    .locator('[data-id="salary-a"] .transfer-arrow')
    .getAttribute('d');
  await page.getByRole('button', { name: '공유 및 내보내기' }).click();
  const next = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG 저장' }).click();
  const svg = await readFile((await (await next).path())!, 'utf8');
  const result = await page.evaluate(
    ({ svg, name }) => {
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const node = Array.from(xml.querySelectorAll('svg[aria-label]')).find(
        (n) => n.getAttribute('aria-label') === name,
      )!;
      return {
        lines: Array.from(
          node.querySelectorAll('text[font-size="18"] tspan'),
          (s) => s.textContent,
        ),
        colors: Array.from(node.querySelectorAll('stop'), (s) =>
          s.getAttribute('stop-color'),
        ),
        icon: node.querySelector('svg')?.getAttribute('class'),
        arrow: Array.from(xml.querySelectorAll('path'))
          .find((p) => p.getAttribute('d')?.endsWith(' Z'))
          ?.getAttribute('d'),
      };
    },
    { svg, name },
  );
  expect(result.lines).toEqual(lines);
  expect(result.colors).toEqual(colors);
  expect(result.icon).toBe(icon);
  const coords = (d: string) => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const expected = coords(liveArrow!);
  coords(result.arrow!).forEach((n, i) =>
    expect(Math.abs(n - expected[i])).toBeLessThan(1),
  );
});
