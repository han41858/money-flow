import type { Page } from '@playwright/test';
import { example } from '../src/app/example';

export async function openExample(page: Page) {
  const fixture = '**/__example-fixture';
  await page.route(fixture, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }),
  );
  await page.goto('/__example-fixture');
  await page.evaluate(
    (diagram) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('money-flow', 2);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('diagrams', { keyPath: 'id' }).add({
            id: diagram.id,
            diagram,
            revision: 1,
            fit: true,
          });
          db.createObjectStore('settings').put(diagram.id, 'last');
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
      }),
    example,
  );
  await page.unroute(fixture);
  await page.goto('/');
}
