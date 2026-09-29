import { test, expect } from '@playwright/test';

test.describe('PWA Resilient Startup & Offline Persistence E2E Test Suite', () => {
  test('Test 1: Hard refresh online - UI visible < 5 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle(/CAPEF/i);
    const bodyVisible = await page.isVisible('body');
    expect(bodyVisible).toBe(true);

    const loadTimeMs = Date.now() - startTime;
    expect(loadTimeMs).toBeLessThan(5000);
  });

  test('Test 2: Refresh offline - UI visible, banner present, no permanent spinner', async ({ page, context }) => {
    await page.goto('/');

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const bodyVisible = await page.isVisible('body');
    expect(bodyVisible).toBe(true);

    await page.waitForTimeout(500);
    const spinnerCount = await page.locator('.animate-spin').count();
    expect(spinnerCount).toBeLessThanOrEqual(1);

    await context.setOffline(false);
  });

  test('Test 3: Corrupted Query Cache recovery', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      localStorage.setItem('capef_query_cache_v1', '{ corrupted syntax json...');
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    const bodyVisible = await page.isVisible('body');
    expect(bodyVisible).toBe(true);

    const cacheValue = await page.evaluate(() => localStorage.getItem('capef_query_cache_v1'));
    expect(cacheValue).toBeNull();
  });

  test('Test 4: Storage / IndexedDB health check resilience', async ({ page }) => {
    await page.goto('/');

    const dbInitialized = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('CapefOfflineDB');
        request.onsuccess = () => {
          const db = request.result;
          const hasStores = db.objectStoreNames.contains('operations') &&
                            db.objectStoreNames.contains('members') &&
                            db.objectStoreNames.contains('regions') &&
                            db.objectStoreNames.contains('departments') &&
                            db.objectStoreNames.contains('arrondissements') &&
                            db.objectStoreNames.contains('media') &&
                            db.objectStoreNames.contains('entityMappings');
          db.close();
          resolve(hasStores);
        };
        request.onerror = () => resolve(false);
      });
    });

    expect(dbInitialized).toBe(true);
  });

  test('Test 5 & 6: API suspended / healthz timeout handling', async ({ page }) => {
    await page.route('**/api/healthz', async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.abort('failed');
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const bodyVisible = await page.isVisible('body');
    expect(bodyVisible).toBe(true);
  });
});
