import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AppStartupController } from '../startup-controller';

// Create a simple mock for localStorage in node test environment
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new LocalStorageMock();
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

if (typeof globalThis.navigator === 'undefined') {
  (globalThis as any).navigator = { onLine: true };
}

describe('AppStartupController Unit & Integration Tests', () => {
  let controller: AppStartupController;

  beforeEach(() => {
    controller = new AppStartupController();
    vi.restoreAllMocks();
    globalThis.localStorage.clear();
    (globalThis.navigator as any).onLine = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in initializing state', () => {
    expect(controller.getState()).toBe('initializing');
  });

  it('detects valid query cache in LocalStorage', () => {
    globalThis.localStorage.setItem('capef_query_cache_v1', JSON.stringify({ timestamp: Date.now(), bdata: {} }));
    const isValid = controller.checkQueryCacheHealth();
    expect(isValid).toBe(true);
    expect(controller.getDiagnostics().cacheCorrupted).toBe(false);
  });

  it('detects corrupted query cache in LocalStorage, purges key safely without throwing', () => {
    globalThis.localStorage.setItem('capef_query_cache_v1', '{ invalid json syntax ...');
    const isValid = controller.checkQueryCacheHealth();
    expect(isValid).toBe(false);
    expect(controller.getDiagnostics().cacheCorrupted).toBe(true);
    expect(globalThis.localStorage.getItem('capef_query_cache_v1')).toBeNull();
  });

  it('times out and returns fallback value when promise takes longer than timeout', async () => {
    const hangingPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('slow_result'), 5000);
    });

    const result = await controller.withTimeout(hangingPromise, 100, 'fallback_timeout');
    expect(result).toBe('fallback_timeout');
  });

  it('transitions to ready-online when /api/healthz responds with HTTP 200 within timeout', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    } as any);

    const state = await controller.initializeStartup();
    expect(state).toBe('ready-online');
    expect(controller.getDiagnostics().healthCheckOk).toBe(true);
  });

  it('transitions to ready-offline when /api/healthz fails or times out', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

    const state = await controller.initializeStartup();
    expect(state).toBe('ready-offline');
    expect(controller.getDiagnostics().healthCheckOk).toBe(false);
  });

  it('notifies subscribers on state changes', async () => {
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as any);

    await controller.initializeStartup();

    expect(listener).toHaveBeenCalled();
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1];
    expect(lastCall[0]).toBe('ready-online');

    unsubscribe();
  });
});
