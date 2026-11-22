import { expect, test } from '@playwright/test';
import { point } from './gestures';

for (const { name, id, handle } of [
  { name: '노드를', id: 'income-a', handle: '.money-node' },
  { name: '그룹을', id: 'group:self', handle: '.group-title' },
]) {
  test(`${name} 드래그하고 놓을 때 연결선이 유지된다`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    const node = page.locator(`[data-id="${id}"]`);
    const canvas = page.locator('.react-flow');
    const paths = canvas.locator('.react-flow__edge-path');
    await expect(paths).toHaveCount(6);
    const start = await point(node.locator(handle));
    const before = await node.boundingBox();
    const path = paths.first();
    const initialPath = await path.getAttribute('d');

    // A final count misses paths that disappear and return after remeasurement.
    const observePaths = () =>
      canvas.evaluateHandle((element) => {
        const counts: number[] = [];
        const observer = new MutationObserver(() => {
          counts.push(
            element.querySelectorAll('.react-flow__edge-path').length,
          );
        });
        observer.observe(element, { childList: true, subtree: true });
        return { counts, observer };
      });

    await page.mouse.move(start.x, start.y);
    const during = await observePaths();
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 25, { steps: 10 });
    const moved = await node.boundingBox();
    const movingCounts = await during.evaluate(({ counts, observer }) => {
      observer.disconnect();
      return counts;
    });

    const drop = await observePaths();
    await page.mouse.up();
    await expect(paths).toHaveCount(6);
    await expect(path).not.toHaveAttribute('d', initialPath!);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const dropped = await node.boundingBox();
    const dropCounts = await drop.evaluate(({ counts, observer }) => {
      observer.disconnect();
      return counts;
    });

    expect(moved!.x - before!.x).toBeGreaterThan(45);
    expect(dropped!.x).toBeCloseTo(moved!.x, 0);
    expect(dropped!.y).toBeCloseTo(moved!.y, 0);
    expect(
      movingCounts.every((count) => count === 6),
      '드래그 중 연결선 개수',
    ).toBe(true);
    expect(
      dropCounts.every((count) => count === 6),
      '드롭 시 연결선 개수',
    ).toBe(true);
  });
}
