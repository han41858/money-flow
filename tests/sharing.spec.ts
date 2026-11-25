import { chooseSavedFlow, openExample } from './exampleFixture';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { example } from '../src/app/example';
import { v2Link } from './shareV2Fixture';

async function share(page: Page) {
  await page.getByRole('button', { name: '공유', exact: true }).click();
  await page.getByText('공유할 이름과 금액 확인').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('급여 A', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/3,200,000원/)).toBeVisible();
  await dialog.getByRole('button', { name: '공유 링크 만들기' }).click();
  const output = dialog.getByLabel('읽기 전용 주소');
  await expect(output).toHaveValue(/#share=\d+\.[\w-]+$/);
  return output.inputValue();
}

test('링크 복사에 성공하면 배치 변경 없이 버튼에 체크를 표시한다', async ({
  page,
  context,
}) => {
  await openExample(page);
  const url = await share(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const dialog = page.getByRole('dialog');
  const button = dialog.getByRole('button', { name: '링크 복사' });
  const check = button.locator('svg.lucide-check');
  const status = dialog.getByRole('status');
  const exportHeading = dialog.getByRole('heading', { name: '파일 다운로드' });
  const buttonBounds = await button.boundingBox();
  const exportBounds = await exportHeading.boundingBox();
  await expect(check).toHaveCount(0);

  await button.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await expect(check).toBeVisible();
  await expect(status).toHaveText('링크를 복사했습니다.');
  await expect(status).toHaveCSS('clip-path', 'inset(50%)');
  await expect(
    dialog.getByText('링크를 복사했습니다.', { exact: true }),
  ).toHaveCount(1);
  expect(await button.boundingBox()).toEqual(buttonBounds);
  expect(await exportHeading.boundingBox()).toEqual(exportBounds);

  await page.evaluate(() => navigator.clipboard.writeText(''));
  await button.click();
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await expect(check).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {
        throw new Error('클립보드 쓰기 실패');
      },
    });
  });
  await button.click();
  await expect(dialog.getByRole('alert')).toHaveText('클립보드 쓰기 실패');
  await expect(check).toHaveCount(0);
  await expect(status).toBeEmpty();
  await expect(button).toBeEnabled();
});

test('링크 열람·선택·확대는 저장소를 생성하지 않고 명시적 복사만 독립된 흐름을 저장한다', async ({
  page,
  browser,
  context,
}) => {
  await openExample(page);
  const url = await share(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const dialog = page.getByRole('dialog', { name: '공유', exact: true });
  const copy = dialog.getByRole('button', { name: '링크 복사', exact: true });
  await copy.click();
  await expect(dialog.getByRole('status')).toHaveText('링크를 복사했습니다.');
  await expect(copy.locator('svg.lucide-check')).toBeVisible();
  await expect(copy.locator('svg.lucide-check')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await expect(
    dialog.getByRole('button', { name: 'JSON 파일 다운로드', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  const guest = await browser.newContext();
  const viewer = await guest.newPage();
  await viewer.goto(url);
  await expect(viewer.getByText('Money Flow · 읽기 전용')).toBeVisible();
  await expect(viewer.getByRole('button', { name: '자동 정렬' })).toHaveCount(
    0,
  );
  await expect(
    viewer.getByRole('button', { name: /이름 수정$|유형 수정$/ }),
  ).toHaveCount(0);
  await viewer
    .locator('.react-flow__node-money')
    .filter({ hasText: '급여 A' })
    .click();
  await expect(viewer.getByRole('region', { name: '선택 상세' })).toContainText(
    '급여 A',
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
    viewer.getByRole('main', { name: '우리 집 자금 흐름 복사본' }),
  ).toBeVisible();
  await viewer.getByRole('button', { name: '내 흐름', exact: true }).click();
  await expect(viewer.locator('.library-list button')).toHaveCount(1);
  await guest.close();
  await page.goto(url);
  await expect(page.getByText('Money Flow · 읽기 전용')).toBeVisible();
  await page.goto('/');
  await page.reload();
  await chooseSavedFlow(page, '우리 집 자금 흐름');
  await page.getByRole('button', { name: '내 흐름', exact: true }).click();
  await expect(page.locator('.library-list button')).toHaveCount(1);
  await expect(page.locator('.library-list')).toContainText(
    '우리 집 자금 흐름',
  );
});
test('같은 흐름의 v3 주소는 v2보다 짧고 읽기 전용 화면의 내용은 같다', async ({
  page,
}) => {
  await openExample(page);
  const current = await share(page);
  const previous = v2Link(example, current.split('#')[0]);

  async function readSharedView(url: string) {
    await page.goto(url);
    await expect(page.getByText('Money Flow · 읽기 전용')).toBeVisible();
    const nodes = page.locator('.react-flow__node-money');
    const groups = page.locator('.react-flow__node-region');
    const amounts = page.locator('.edge-label');
    await expect(nodes).toHaveCount(example.nodes.length);
    await expect(groups).toHaveCount(example.groups.length);
    await expect(amounts).toHaveCount(example.edges.length);
    await amounts.filter({ hasText: '320만' }).click();
    const details = page.getByRole('region', { name: '선택 상세' });
    await expect(details).toContainText('3,200,000원');
    return {
      nodes: (await nodes.allTextContents()).sort(),
      groups: (await groups.allTextContents()).sort(),
      amounts: (await amounts.allTextContents()).sort(),
      details: await details.innerText(),
    };
  }

  const legacyView = await readSharedView(previous);
  // Reload even when the old writer emits exactly the same URL as the fixture.
  await page.goto('/');
  expect(await readSharedView(current)).toEqual(legacyView);
  expect(current.length).toBeLessThan(previous.length);
  expect(current).toMatch(/#share=3\./);
});

test('공유 주소가 길이 제한을 넘으면 JSON 파일 다운로드를 안내하고 파일을 저장한다', async ({
  page,
}) => {
  await openExample(page);
  await page.evaluate(() => {
    // 페이지를 다시 로드하지 않고 공유 주소의 경로를 길게 만든다.
    history.replaceState(history.state, '', `/${'a'.repeat(8000)}`);
  });
  await page.locator('.share-trigger').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '공유 링크 만들기' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    '공유 주소가 8,000자를 넘습니다. ‘JSON 파일 다운로드’를 선택해 공유하세요.',
  );
  await expect(dialog.getByLabel('읽기 전용 주소')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await dialog
    .getByRole('button', { name: 'JSON 파일 다운로드', exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${example.name}.json`);
  const json = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(json.name).toBe(example.name);
  expect(json.schemaVersion).toBe(example.schemaVersion);
  expect(json.nodes).toHaveLength(example.nodes.length);
});

test('손상된 공유 링크에서도 편집기를 열거나 로컬 데이터베이스를 만들지 않는다', async ({
  page,
}) => {
  for (const version of [1, 3]) {
    await page.goto(`/#share=${version}.broken`);
    await expect(page.getByRole('alert')).toContainText('공유 링크');
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  }
});
test('화면 밖의 데이터까지 SVG와 두 배 크기 PNG로 내려받는다', async ({
  page,
}, info) => {
  await openExample(page);
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await page.getByRole('button', { name: '공유', exact: true }).click();
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

test('이름에 맞춘 노드 너비·브랜드 배경·유형 아이콘과 화살촉이 캔버스와 SVG에서 일치한다', async ({
  page,
}) => {
  await openExample(page);
  await page
    .getByRole('button', { name: '공동 생활비 통장', exact: true })
    .click();
  const joint = page.locator('[data-id="joint"] .money-node');
  await expect(joint.locator('.react-flow__handle.target')).toHaveCount(1);
  await expect(joint.locator('.react-flow__handle.source')).toHaveCount(1);
  const card = joint.locator(':scope > svg');
  const outgoing = page.locator(
    '[data-id="card-payment"] .react-flow__edge-path',
  );
  const initialWidth = Number(await card.getAttribute('width'));
  const initialPath = await outgoing.getAttribute('d');
  const input = page.getByLabel('이름', { exact: true });
  await input.fill('통장');
  await input.press('Enter');
  await expect
    .poll(async () => Number(await card.getAttribute('width')))
    .toBeLessThan(initialWidth);
  await expect(outgoing).not.toHaveAttribute('d', initialPath!);
  const name = '가족의 월간 생활비와 교육비를 함께 관리하는 공동 계좌';
  await input.fill(name);
  await input.press('Enter');
  await expect
    .poll(async () => Number(await card.getAttribute('width')))
    .toBeGreaterThan(initialWidth);
  const text = card.locator(':scope > text');
  const iconBox = (await card.locator('svg').boundingBox())!;
  const textBox = (await text.boundingBox())!;
  expect(textBox.x).toBeGreaterThan(iconBox.x + iconBox.width);
  expect(
    Math.abs(textBox.y + textBox.height / 2 - iconBox.y - iconBox.height / 2),
  ).toBeLessThan(4);
  const label = await text.textContent();
  expect(label).toBe(name);
  const width = await card.getAttribute('width');
  const background = card.locator(':scope > rect');
  await expect(background).toHaveCount(1);
  expect(await background.getAttribute('stroke')).toBeNull();
  const fill = await background.getAttribute('fill');
  expect(fill).toBe('#ebc638');
  await expect(card.locator(':scope > text')).toHaveCount(1);
  const icon = await card.locator('svg').getAttribute('class');
  const liveEdge = page.locator('.transfer-visual[data-edge-id="salary-a"]');
  const liveArrow = await liveEdge.locator('.transfer-arrow').getAttribute('d');
  const liveShaft = await liveEdge.locator('.transfer-shaft').getAttribute('d');
  await page.getByRole('button', { name: '공유', exact: true }).click();
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
        label: node.querySelector(':scope > text')?.textContent,
        width: node.getAttribute('width'),
        background: Array.from(node.querySelectorAll(':scope > rect'), (r) => [
          r.getAttribute('fill'),
          r.getAttribute('stroke'),
        ]),
        textCount: node.querySelectorAll(':scope > text').length,
        totals: Array.from(
          node.querySelectorAll('.node-totals text'),
          (t) => t.textContent,
        ),
        icon: node.querySelector('svg')?.getAttribute('class'),
        arrow: xml.querySelector('.transfer-arrow')?.getAttribute('d'),
        shaft: xml.querySelector('.transfer-shaft')?.getAttribute('d'),
      };
    },
    { svg, name },
  );
  expect(result.label).toBe(label);
  expect(result.width).toBe(width);
  expect(result.background).toEqual([[fill, null]]);
  expect(result.textCount).toBe(1);
  expect(result.totals).toEqual(['560만', '228~258만']);
  expect(result.icon).toBe(icon);
  const coords = (d: string) => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  for (const [exported, live] of [
    [result.arrow, liveArrow],
    [result.shaft, liveShaft],
  ]) {
    const expected = coords(live!);
    const actual = coords(exported!);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((n, i) => expect(Math.abs(n - expected[i])).toBeLessThan(1));
  }
});

test('중첩 그룹을 공유 화면과 SVG에 부모부터 렌더링한다', async ({
  page,
}, info) => {
  const [parent] = example.groups;
  await openExample(page, {
    ...example,
    groups: [
      {
        ...parent,
        id: 'salary-group',
        parentId: parent.id,
        name: '급여 하위 그룹',
        position: { x: -10, y: 38 },
        width: 150,
        height: 90,
      },
      ...example.groups,
    ],
    nodes: example.nodes.map((node) =>
      node.id === 'income-a' ? { ...node, groupId: 'salary-group' } : node,
    ),
  });
  await page.getByRole('button', { name: '공유', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG 저장' }).click();
  const svgPath = info.outputPath('nested.svg');
  await (await download).saveAs(svgPath);
  const svg = await readFile(svgPath, 'utf8');
  expect(svg).toContain('급여 하위 그룹');
  expect(svg.indexOf('개인 A')).toBeLessThan(svg.indexOf('급여 하위 그룹'));
  await page.keyboard.press('Escape');

  const url = await share(page);
  await page.goto(url);
  const groups = page.locator('.react-flow__node-region');
  await expect(groups).toHaveCount(4);
  const names = await groups.allTextContents();
  expect(names.indexOf('개인 A')).toBeLessThan(names.indexOf('급여 하위 그룹'));
  const parentGroup = groups.filter({ hasText: '개인 A' });
  const childGroup = groups.filter({ hasText: '급여 하위 그룹' });
  await expect(parentGroup).toBeVisible();
  await expect(childGroup).toBeVisible();
  const outer = (await parentGroup.boundingBox())!;
  const inner = (await childGroup.boundingBox())!;
  expect(inner.x).toBeGreaterThan(outer.x);
  expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width);
});
