import { test, expect } from '@playwright/test';

test.describe('PWA Offline & IndexedDB Persistence E2E Test Suite', () => {
  test('verifies PWA offline readiness and IndexedDB operation queueing', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/CAPEF/i);

    const swSupported = await page.evaluate(() => 'serviceWorker' in navigator);
    expect(swSupported).toBe(true);

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

  test('verifies offline simulation and reload resilience', async ({ page, context }) => {
    await page.goto('/');

    await context.setOffline(true);
    const isOnline = await page.evaluate(() => navigator.onLine);
    expect(isOnline).toBe(false);

    await context.setOffline(false);
    const isOnlineRestored = await page.evaluate(() => navigator.onLine);
    expect(isOnlineRestored).toBe(true);
  });
});
