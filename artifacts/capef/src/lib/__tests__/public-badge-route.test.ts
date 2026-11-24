import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Public badge verification route', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf-8');
  const pageSource = fs.readFileSync(
    path.resolve(__dirname, '../../pages/members/PublicBadgeVerify.tsx'),
    'utf-8',
  );

  it('resolves the badge route in the root router before the Clerk application tree', () => {
    const appRootIndex = appSource.indexOf('function App()');
    const publicRouteIndex = appSource.indexOf('path="/badge-verify/:token"', appRootIndex);
    const clerkFallbackIndex = appSource.indexOf('<Route component={ClerkProviderWithRoutes} />', appRootIndex);
    const authenticatedTree = appSource.slice(appSource.indexOf('function ClerkProviderWithRoutes()'), appRootIndex);

    expect(appRootIndex).toBeGreaterThanOrEqual(0);
    expect(publicRouteIndex).toBeGreaterThan(appRootIndex);
    expect(clerkFallbackIndex).toBeGreaterThan(publicRouteIndex);
    expect(authenticatedTree).not.toContain('/badge-verify/:token');
  });

  it('fetches only the public endpoint without credentials or cached responses', () => {
    expect(pageSource).toContain('/api/public/members/badge/');
    expect(pageSource).toContain("credentials: 'omit'");
    expect(pageSource).toContain("cache: 'no-store'");
    expect(pageSource).not.toContain('customFetch');
    expect(pageSource).not.toContain('/api/auth/');
    expect(pageSource).not.toMatch(/\buseAuth\b|\buseUser\b/);
  });
});
