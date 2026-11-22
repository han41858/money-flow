import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { example } from '../src/app/example';

const manager = (p: Page) => p.getByRole('dialog', { name: '내 흐름' });
async function library(p: Page) {
  await p.getByRole('button', { name: '내 흐름', exact: true }).click();
  await expect(manager(p)).toBeVisible();
  return manager(p);
}
async function saved(p: Page) {
  await expect(
    p.getByRole('status').filter({ hasText: '이 브라우저에 저장됨' }),
  ).toBeVisible();
}
async function rename(p: Page, name: string) {
  const d = await library(p);
  await d.getByLabel('흐름 이름').fill(name);
  await d.getByRole('button', { name: '이름 변경' }).click();
  await expect(d.getByRole('button', { name: '이름 변경' })).toBeDisabled();
  await d.getByRole('button', { name: '목록 닫기' }).click();
  await expect(p.getByRole('main', { name, exact: true })).toBeVisible();
}
test('좁은 화면에서도 헤더에서 현재 흐름 이름을 수정하고 다시 열면 복원한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  const title = page.locator('.workspace-title');
  await title.getByRole('button').click();
  const input = title.getByRole('textbox', { name: '현재 흐름 이름' });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(example.name);
  await input.fill('취소할 이름');
  await input.press('Escape');
  await expect(title.getByRole('button')).toHaveText(example.name);
  await expect(title.getByRole('button')).toBeFocused();
  await title.getByRole('button').click();
  await input.fill('  12월 자금 계획  ');
  await input.press('Enter');
  await expect(title.getByRole('button')).toHaveText('12월 자금 계획');
  await expect(title.getByRole('button')).toBeFocused();
  const tools = page.getByRole('button', { name: '노드 목록 열기' });
  await tools.click();
  await saved(page);
  await page.reload();
  await expect(title.getByRole('button')).toHaveText('12월 자금 계획');
  await title.getByRole('button').click();
  await input.fill('다음 달 자금 계획');
  await input.press('Tab');
  await expect(title.getByRole('button')).toHaveText('다음 달 자금 계획');
});
test('브라우저를 닫고 다시 열면 편집 내용과 뷰포트가 복원되고 이력은 비워진다', async ({
  playwright,
  baseURL,
  launchOptions,
}, info) => {
  const profile = info.outputPath('browser-profile');
  const launch = () =>
    playwright.chromium.launchPersistentContext(profile, {
      ...launchOptions,
      baseURL,
    });
  let context = await launch();
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: '새 흐름', exact: true }).click();
    await page.getByRole('button', { name: '계좌 추가' }).click();
    await page.getByLabel('이름', { exact: true }).fill('저장된 통장');
    await page.getByLabel('이름', { exact: true }).press('Enter');
    await page.getByRole('button', { name: '속성 닫기' }).click();
    const node = page.locator('.react-flow__node-money');
    const rect = (await node.boundingBox())!;
    await page.mouse.move(rect.x + 30, rect.y + 30);
    await page.mouse.down();
    await page.mouse.move(rect.x + 90, rect.y + 90, { steps: 6 });
    await page.mouse.up();
    const position = await node.evaluate((n) => n.style.transform);
    const canvas = page.locator('.react-flow__viewport');
    await page.getByRole('button', { name: '확대', exact: true }).click();
    await expect(page.getByLabel('확대 비율')).not.toHaveText('100%');
    await saved(page);
    const view = await canvas.getAttribute('style');
    await context.close();
    context = await launch();
    const next = await context.newPage();
    await next.goto('/');
    await expect(
      next.getByRole('main', { name: '새 자금 흐름' }),
    ).toBeVisible();
    await expect(next.locator('.react-flow__node-money')).toContainText(
      '저장된 통장',
    );
    await expect
      .poll(() =>
        next
          .locator('.react-flow__node-money')
          .evaluate((n) => n.style.transform),
      )
      .toBe(position);
    await expect(next.locator('.react-flow__viewport')).toHaveAttribute(
      'style',
      view!,
    );
    await expect(
      next.getByRole('button', { name: '실행 취소' }),
    ).toBeDisabled();
  } finally {
    await context.close();
  }
});
test('목록에서 열기·복제·삭제하고 JSON을 독립된 흐름으로 가져온다', async ({
  page,
}) => {
  await page.goto('/');
  await rename(page, '11월 계획');
  let d = await library(page);
  const download = page.waitForEvent('download');
  await d.getByRole('button', { name: 'JSON 내보내기' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('11월 계획.json');
  const json = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(json.name).toBe('11월 계획');
  expect(json.nodes).toHaveLength(7);
  await d.getByRole('button', { name: '복제', exact: true }).click();
  await expect(
    page.getByRole('main', { name: '11월 계획 복사본' }),
  ).toBeVisible();
  d = await library(page);
  await d.getByRole('button', { name: '11월 계획 열기' }).click();
  await expect(
    page.getByRole('main', { name: '11월 계획', exact: true }),
  ).toBeVisible();
  d = await library(page);
  await d.getByLabel('JSON 파일 선택').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...json, name: '가져온 계획' })),
  });
  await expect(page.getByRole('main', { name: '가져온 계획' })).toBeVisible();
  d = await library(page);
  const exported = page.waitForEvent('download');
  await d.getByRole('button', { name: 'JSON 내보내기' }).click();
  const copy = JSON.parse(
    await readFile((await (await exported).path())!, 'utf8'),
  );
  expect(copy.id).not.toBe(json.id);
  expect(copy.nodes).toEqual(json.nodes);
  expect(copy.viewport).toEqual(json.viewport);
  await d.getByLabel('JSON 파일 선택').setInputFiles({
    name: 'new.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...json, schemaVersion: 3 })),
  });
  await expect(d.getByRole('alert')).toContainText('최신 버전');
  page.once('dialog', (e) => e.dismiss());
  await d.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(d.getByLabel('흐름 이름')).toHaveValue('가져온 계획');
  page.once('dialog', (e) => e.accept());
  await d.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(d).toBeHidden();
  d = await library(page);
  await expect(d.getByRole('button', { name: /가져온 계획/ })).toHaveCount(0);
  await expect(d.getByRole('button', { name: /11월 계획/ })).toHaveCount(2);
});
test('두 탭에서 같은 흐름을 편집하면 최신 내용 또는 현재 탭 내용을 선택한다', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await saved(page);
  const other = await context.newPage();
  await other.goto('/');
  await saved(other);
  await page.getByRole('button', { name: '카드 추가' }).click();
  await saved(page);
  await expect(other.getByRole('alert')).toContainText('다른 탭');
  await other.getByRole('button', { name: '최신 내용 불러오기' }).click();
  await expect(other.locator('.react-flow__node-money')).toHaveCount(8);
  await page.getByRole('button', { name: '지출 추가' }).click();
  await saved(page);
  await expect(other.getByRole('alert')).toBeVisible();
  await other.getByRole('button', { name: '수입 추가' }).click();
  await other.getByRole('button', { name: '현재 탭 내용으로 계속' }).click();
  await saved(other);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '최신 내용 불러오기' }).click();
  await expect(
    page.locator('.react-flow__node-money').filter({ hasText: '새 수입' }),
  ).toHaveCount(1);
  await expect(
    page.locator('.react-flow__node-money').filter({ hasText: '새 지출' }),
  ).toHaveCount(0);
});
test('파일 손상 시 열려 있는 흐름을 유지한다', async ({ page }) => {
  await page.goto('/');
  const d = await library(page);
  await d.getByLabel('JSON 파일 선택').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not json'),
  });
  await expect(d.getByRole('alert')).toContainText('JSON 파일');
  await expect(d.getByLabel('흐름 이름')).toHaveValue(example.name);
  await expect(d.getByRole('button', { name: example.name })).toHaveCount(1);
});

test('저장 공간 부족 시 편집을 유지하고 재시도하면 복원된다', async ({
  page,
}) => {
  await page.goto('/');
  await saved(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'diagrams') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Test quota', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '지출 추가' }).click();
  await expect(page.getByRole('alert')).toContainText('저장 공간이 부족');
  await expect(page.locator('.react-flow__node-money')).toHaveCount(8);
  await page.getByRole('button', { name: '저장 다시 시도' }).click();
  await saved(page);
  await page.reload();
  await expect(page.locator('.react-flow__node-money')).toHaveCount(8);
});

test('삭제한 흐름을 다른 탭이 덮어쓰지 않고 새 흐름으로 보관한다', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await saved(page);
  const other = await context.newPage();
  await other.goto('/');
  await saved(other);
  const d = await library(page);
  page.once('dialog', (e) => e.accept());
  await d.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByRole('main', { name: '새 자금 흐름' })).toBeVisible();
  await expect(other.getByRole('alert')).toContainText('삭제했습니다');
  await other.getByRole('button', { name: '새 흐름으로 보관' }).click();
  await saved(other);
  const copy = await library(other);
  const pending = other.waitForEvent('download');
  await copy.getByRole('button', { name: 'JSON 내보내기' }).click();
  const exported = JSON.parse(
    await readFile((await (await pending).path())!, 'utf8'),
  );
  expect(exported.id).not.toBe(example.id);
  expect(exported.nodes).toEqual(example.nodes);
  await expect(
    copy.getByRole('button', { name: '새 자금 흐름 열기' }),
  ).toBeVisible();
});

test('알림을 받기 전의 쓰기도 저장 트랜잭션에서 충돌을 감지한다', async ({
  page,
}) => {
  await page.goto('/');
  await saved(page);
  await page.evaluate(
    (id) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('money-flow');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('diagrams', 'readwrite');
          const store = tx.objectStore('diagrams');
          const read = store.get(id);
          read.onsuccess = () => {
            const row = read.result;
            store.put({
              ...row,
              revision: row.revision + 1,
              diagram: { ...row.diagram, name: '다른 탭에서 저장한 이름' },
            });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    example.id,
  );
  await page.getByRole('button', { name: '계좌 추가' }).click();
  await expect(page.getByRole('alert')).toContainText('다른 탭');
  await page.getByRole('button', { name: '최신 내용 불러오기' }).click();
  await expect(
    page.getByRole('main', { name: '다른 탭에서 저장한 이름' }),
  ).toBeVisible();
  await expect(page.locator('.react-flow__node-money')).toHaveCount(7);
});

test('지원하지 않는 로컬 버전을 보존하고 다른 흐름을 열 수 있다', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새 흐름', exact: true }).click();
  await expect(page.getByRole('main', { name: '새 자금 흐름' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('money-flow');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['settings', 'diagrams'], 'readwrite');
          const active = tx.objectStore('settings').get('last');
          active.onsuccess = () => {
            const store = tx.objectStore('diagrams');
            const r = store.get(active.result);
            r.onsuccess = () =>
              store.put({
                ...r.result,
                diagram: { ...r.result.diagram, schemaVersion: 99 },
              });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByText(/더 최신 버전의 다이어그램/)).toBeVisible();
  await page.getByRole('button', { name: example.name }).click();
  await expect(page.getByRole('main', { name: example.name })).toBeVisible();
  const d = await library(page);
  await d.getByRole('button', { name: '새 자금 흐름 열기' }).click();
  await expect(d.getByRole('alert')).toContainText('최신 버전');
  await expect(d.getByLabel('흐름 이름')).toHaveValue(example.name);
});
