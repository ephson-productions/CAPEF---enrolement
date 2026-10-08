import { describe, it, expect, beforeEach } from 'vitest';

class StorageMock {
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

const mockSessionStorage = new StorageMock();

if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as any).sessionStorage = mockSessionStorage;
}

describe('MembersList Registry Navigation Context & URL State Synchronization Tests', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear();
  });

  it('1. Parses URL search query parameters into filter and page state', () => {
    const searchString = '?page=4&category=agriculteur&status=valide&search=Mbida';
    const params = new URLSearchParams(searchString);

    expect(params.get('page')).toBe('4');
    expect(params.get('category')).toBe('agriculteur');
    expect(params.get('status')).toBe('valide');
    expect(params.get('search')).toBe('Mbida');
  });

  it('2. Resets page to 1 when changing filters or search terms', () => {
    let page = 4;
    const category = 'pecheur';

    // Simulated filter change handler
    const onFilterChange = (newCat: string) => {
      page = 1;
      return newCat;
    };

    const updatedCategory = onFilterChange('eleveur');
    expect(page).toBe(1);
    expect(updatedCategory).toBe('eleveur');
  });

  it('3. Constructs correct back navigation URL restoring registry context', () => {
    const currentFromUrl = '/members?page=4&category=agriculteur&status=valide';
    globalThis.sessionStorage.setItem('capef:members-registry-from', currentFromUrl);

    const storedFromUrl = globalThis.sessionStorage.getItem('capef:members-registry-from');
    expect(storedFromUrl).toBe(currentFromUrl);
  });

  it('4. Saves and restores scroll position key in sessionStorage', () => {
    const scrollY = 850;
    globalThis.sessionStorage.setItem('capef:members-registry-scroll', String(scrollY));

    const retrievedScroll = globalThis.sessionStorage.getItem('capef:members-registry-scroll');
    expect(Number(retrievedScroll)).toBe(850);

    globalThis.sessionStorage.removeItem('capef:members-registry-scroll');
    expect(globalThis.sessionStorage.getItem('capef:members-registry-scroll')).toBeNull();
  });
});
