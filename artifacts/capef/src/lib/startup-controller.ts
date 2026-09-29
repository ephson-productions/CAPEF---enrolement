import { db } from './repositories/CapefDexieDatabase';

export type StartupState =
  | 'initializing'
  | 'ready-online'
  | 'ready-offline'
  | 'syncing'
  | 'storage-unavailable'
  | 'cache-corrupt'
  | 'session-renewal'
  | 'recoverable-error';

export interface StartupDiagnostics {
  isOnline: boolean;
  healthCheckOk: boolean;
  indexedDbOk: boolean;
  localStorageOk: boolean;
  cacheCorrupted: boolean;
  errorMessage: string | null;
  lastCheckTimestamp: string | null;
}

export class AppStartupController {
  private state: StartupState = 'initializing';
  private diagnostics: StartupDiagnostics = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    healthCheckOk: false,
    indexedDbOk: true,
    localStorageOk: true,
    cacheCorrupted: false,
    errorMessage: null,
    lastCheckTimestamp: null,
  };

  private listeners: Set<(state: StartupState, diagnostics: StartupDiagnostics) => void> = new Set();

  getState(): StartupState {
    return this.state;
  }

  getDiagnostics(): StartupDiagnostics {
    return { ...this.diagnostics };
  }

  subscribe(listener: (state: StartupState, diagnostics: StartupDiagnostics) => void): () => void {
    this.listeners.add(listener);
    listener(this.state, this.diagnostics);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(newState: StartupState, errorMessage: string | null = null): void {
    this.state = newState;
    if (errorMessage !== null) {
      this.diagnostics.errorMessage = errorMessage;
    }
    this.diagnostics.lastCheckTimestamp = new Date().toISOString();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state, { ...this.diagnostics });
      } catch (err) {
        console.error('[AppStartupController] Listener error:', err);
      }
    }
  }

  async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
    let timer: any = null;
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        resolve(fallbackValue);
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async checkNetworkHealth(timeoutMs = 3000): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    if (!navigator.onLine) {
      this.diagnostics.isOnline = false;
      this.diagnostics.healthCheckOk = false;
      return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const basePath = import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, '') : '';
      const healthUrl = `${basePath}/api/healthz`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });

      clearTimeout(timer);
      const isOk = response.ok && response.status === 200;
      this.diagnostics.isOnline = isOk;
      this.diagnostics.healthCheckOk = isOk;
      return isOk;
    } catch (err) {
      clearTimeout(timer);
      this.diagnostics.isOnline = false;
      this.diagnostics.healthCheckOk = false;
      return false;
    }
  }

  async checkStorageHealth(): Promise<{ localStorageOk: boolean; indexedDbOk: boolean }> {
    let localStorageOk = false;
    let indexedDbOk = false;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const testKey = '__capef_storage_test__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        localStorageOk = true;
      }
    } catch (e) {
      console.warn('[AppStartupController] LocalStorage is unavailable or blocked:', e);
    }

    try {
      if (typeof indexedDB !== 'undefined') {
        await this.withTimeout(
          (async () => {
            if (!db.isOpen()) {
              await db.open();
            }
            return true;
          })(),
          2500,
          false
        );
        indexedDbOk = db.isOpen();
      }
    } catch (e) {
      console.warn('[AppStartupController] IndexedDB is unavailable or blocked:', e);
    }

    this.diagnostics.localStorageOk = localStorageOk;
    this.diagnostics.indexedDbOk = indexedDbOk;

    return { localStorageOk, indexedDbOk };
  }

  checkQueryCacheHealth(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return true;

    const cacheKey = 'capef_query_cache_v1';
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (raw) {
        JSON.parse(raw);
      }
      this.diagnostics.cacheCorrupted = false;
      return true;
    } catch (err) {
      console.warn('[AppStartupController] Corrupted query cache detected in localStorage. Safely purging key:', err);
      try {
        window.localStorage.removeItem(cacheKey);
      } catch (e) {
        console.error('[AppStartupController] Failed to remove corrupted query cache key:', e);
      }
      this.diagnostics.cacheCorrupted = true;
      return false;
    }
  }

  async initializeStartup(): Promise<StartupState> {
    this.setState('initializing');

    const cacheValid = this.checkQueryCacheHealth();
    if (!cacheValid) {
      this.setState('cache-corrupt', 'Le cache local a été réinitialisé suite à une corruption.');
    }

    const { localStorageOk, indexedDbOk } = await this.checkStorageHealth();
    if (!indexedDbOk && !localStorageOk) {
      this.setState('storage-unavailable', 'Le stockage local (IndexedDB / LocalStorage) est indisponible sur cet appareil.');
      return 'storage-unavailable';
    }

    const isNetworkHealthy = await this.checkNetworkHealth(3000);

    if (isNetworkHealthy) {
      this.setState('ready-online');
      return 'ready-online';
    } else {
      this.setState('ready-offline');
      return 'ready-offline';
    }
  }

  async retryStartup(): Promise<StartupState> {
    return this.initializeStartup();
  }
}

export const startupController = new AppStartupController();
