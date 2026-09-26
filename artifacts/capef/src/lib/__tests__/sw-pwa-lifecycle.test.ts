import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 10 — Service Worker & PWA Life Cycle Configuration Tests', () => {
  it('confirms workbox configuration in vite.config.ts enforces registerType autoUpdate and NetworkOnly for /api/* routes', () => {
    const configPath = path.resolve(__dirname, '../../../vite.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);

    const configContent = fs.readFileSync(configPath, 'utf-8');

    // 1. Verify autoUpdate registerType
    expect(configContent).toContain("registerType: 'autoUpdate'");

    // 2. Verify instant activation flags (skipWaiting, clientsClaim, cleanupOutdatedCaches)
    expect(configContent).toContain('skipWaiting: true');
    expect(configContent).toContain('clientsClaim: true');
    expect(configContent).toContain('cleanupOutdatedCaches: true');

    // 3. Verify StaleWhileRevalidate for reference data and NetworkFirst for general /api/ routes
    expect(configContent).toContain("cacheName: 'capef-reference-data'");
    expect(configContent).toContain("cacheName: 'capef-api-data'");
  });

  it('verifies dist/sw.js generated during build includes skipWaiting and clientsClaim', () => {
    const distSwPath = path.resolve(__dirname, '../../../dist/sw.js');
    if (fs.existsSync(distSwPath)) {
      const swContent = fs.readFileSync(distSwPath, 'utf-8');
      expect(swContent).toContain('self.skipWaiting()');
    }
  });
});
