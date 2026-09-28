import React, { createContext, useContext } from 'react';
import { useGetMe, AppUser } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';

type AuthContextType = {
  user: AppUser | undefined;
  isLoading: boolean;
  isClerkLoaded: boolean;
  isAuthenticated: boolean;
  isOfflineSession: boolean;
  role: string | null;
  isAdmin: boolean;
  isSupervisor: boolean;
  isAgent: boolean;
  refetch: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_KEY_PREFIX = 'capef_ui_cached_claims_v1_';
const CACHE_TTL_MS = 21 * 24 * 60 * 60 * 1000; // 21 days UI gating cache authorized by Ephraim
const LAST_KNOWN_USER_ID_KEY = 'capef_last_known_user_id';
const OFFLINE_SESSION_KEY = 'capef_offline_session_v1';

export interface LocallyCachedClaims {
  role: string;
  assignedRegionId?: number | null;
  email: string;
  name: string;
  cachedAt: string;
}

/**
 * ARCHITECTURAL NOTICE — FOR UI GATING DISPLAY ONLY.
 * This function retrieves locally cached user claims (role, region) for rendering UI components
 * (such as showing/hiding sidebar buttons or form steps) during offline PWA operation.
 *
 * CRITICAL SECURITY GUARANTEE:
 * This cached role NEVER replaces or bypasses real backend authentication. The API server
 * (`requireAppUser` in `artifacts/api-server/src/lib/auth.ts`) validates Clerk session tokens on
 * EVERY protected HTTP request without exception.
 */
export function getLocallyCachedRoleForUIGatingOnly(clerkUserId: string | null | undefined): LocallyCachedClaims | null {
  if (!clerkUserId) return null;
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${clerkUserId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cachedTime = new Date(parsed.cachedAt).getTime();
    if (Date.now() - cachedTime > CACHE_TTL_MS) {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${clerkUserId}`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('[auth.tsx] Error reading locally cached claims:', err);
    return null;
  }
}

function readJsonFromLocalStorage<T>(key: string): T | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch (err) {
    console.error(`[auth.tsx] Error reading local storage key ${key}:`, err);
    return null;
  }
}

export function getLastKnownClerkUserId(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(LAST_KNOWN_USER_ID_KEY);
  } catch {
    return null;
  }
}

function rememberLastKnownClerkUserId(clerkUserId: string): void {
  if (typeof window === 'undefined' || !window.localStorage || !clerkUserId) return;
  try {
    window.localStorage.setItem(LAST_KNOWN_USER_ID_KEY, clerkUserId);
  } catch (err) {
    console.error('[auth.tsx] Error persisting last known Clerk user:', err);
  }
}

export function clearOfflineSession(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(OFFLINE_SESSION_KEY);
    window.localStorage.removeItem(LAST_KNOWN_USER_ID_KEY);
  } catch (err) {
    console.error('[auth.tsx] Error clearing offline session:', err);
  }
}

type OfflineSessionSnapshot = {
  clerkUserId: string;
  cachedAt: string;
};

function rememberOfflineSession(clerkUserId: string): void {
  if (typeof window === 'undefined' || !window.localStorage || !clerkUserId) return;
  try {
    const snapshot: OfflineSessionSnapshot = {
      clerkUserId,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.error('[auth.tsx] Error persisting offline session marker:', err);
  }
}

function getOfflineSessionClaims(): LocallyCachedClaims | null {
  const snapshot = readJsonFromLocalStorage<OfflineSessionSnapshot>(OFFLINE_SESSION_KEY);
  const clerkUserId = snapshot?.clerkUserId || getLastKnownClerkUserId();
  return clerkUserId ? getLocallyCachedRoleForUIGatingOnly(clerkUserId) : null;
}

export function cacheClaimsForUIGatingOnly(user: AppUser): void {
  if (!user || !user.clerkUserId) return;
  try {
    const claims: LocallyCachedClaims = {
      role: user.role,
      assignedRegionId: user.regionId ?? null,
      email: user.email,
      name: user.name,
      cachedAt: new Date().toISOString(),
    };
    localStorage.setItem(`${CACHE_KEY_PREFIX}${user.clerkUserId}`, JSON.stringify(claims));
    rememberLastKnownClerkUserId(user.clerkUserId);
    rememberOfflineSession(user.clerkUserId);
  } catch (err) {
    console.error('[auth.tsx] Error caching claims for UI gating:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isSignedIn, isLoaded: isClerkLoaded } = useUser();
  const clerkUserId = clerkUser?.id ?? null;
  const [isBrowserOnline, setIsBrowserOnline] = React.useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );

  React.useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  React.useEffect(() => {
    if (isSignedIn && clerkUserId) {
      rememberLastKnownClerkUserId(clerkUserId);
    }
  }, [isSignedIn, clerkUserId]);

  const { data: user, isLoading: isMeLoading, refetch } = useGetMe({
    query: {
      enabled: !!isSignedIn && isBrowserOnline,
      retry: false,
      queryKey: ['auth-me'],
      staleTime: 1000 * 60 * 5,
    }
  });

  // Cache user claims whenever successfully retrieved online
  React.useEffect(() => {
    if (user) {
      cacheClaimsForUIGatingOnly(user);
    }
  }, [user]);

  const isLoading = !!(isMeLoading && isSignedIn);

  // Fallback to locally cached claims during offline mode for UI display
  const offlineCachedClaims = React.useMemo(() => {
    if (!user) {
      return getLocallyCachedRoleForUIGatingOnly(clerkUserId) || getOfflineSessionClaims();
    }
    return null;
  }, [user, clerkUserId]);

  const role = user?.role || offlineCachedClaims?.role || null;
  const isOfflineSession = !isSignedIn && !isBrowserOnline && !!offlineCachedClaims;
  const isAuthenticated = !!isSignedIn || isOfflineSession;

  const value = {
    user: user || (offlineCachedClaims ? ({
      id: 0,
      clerkUserId: clerkUserId || getLastKnownClerkUserId() || '',
      email: offlineCachedClaims.email,
      name: offlineCachedClaims.name,
      role: offlineCachedClaims.role as any,
      status: 'active',
      regionId: offlineCachedClaims.assignedRegionId ?? null,
      createdAt: offlineCachedClaims.cachedAt,
    } as AppUser) : undefined),
    isLoading: !!(isMeLoading && isSignedIn && isBrowserOnline),
    isClerkLoaded,
    isAuthenticated,
    isOfflineSession,
    role,
    isAdmin: role === 'admin',
    isSupervisor: role === 'supervisor',
    isAgent: role === 'agent',
    refetch: () => { refetch(); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
