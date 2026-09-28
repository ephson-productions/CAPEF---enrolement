import React, { createContext, useContext } from 'react';
import { useGetMe, AppUser } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';

type AuthContextType = {
  user: AppUser | undefined;
  isLoading: boolean;
  role: string | null;
  isAdmin: boolean;
  isSupervisor: boolean;
  isAgent: boolean;
  refetch: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_KEY_PREFIX = 'capef_ui_cached_claims_v1_';
const CACHE_TTL_MS = 21 * 24 * 60 * 60 * 1000; // 21 days UI gating cache authorized by Ephraim

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
  } catch (err) {
    console.error('[auth.tsx] Error caching claims for UI gating:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isSignedIn, isLoaded: isClerkLoaded } = useUser();
  const clerkUserId = clerkUser?.id ?? null;

  const { data: user, isLoading: isMeLoading, refetch } = useGetMe({
    query: {
      enabled: !!isSignedIn,
      retry: false,
      queryKey: ['auth-me']
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
    if (!user && clerkUserId) {
      return getLocallyCachedRoleForUIGatingOnly(clerkUserId);
    }
    return null;
  }, [user, clerkUserId]);

  const role = user?.role || offlineCachedClaims?.role || null;

  const value = {
    user: user || (offlineCachedClaims ? ({
      id: 0,
      clerkUserId: clerkUserId || '',
      email: offlineCachedClaims.email,
      name: offlineCachedClaims.name,
      role: offlineCachedClaims.role as any,
      status: 'active',
      regionId: offlineCachedClaims.assignedRegionId ?? null,
      createdAt: offlineCachedClaims.cachedAt,
    } as AppUser) : undefined),
    isLoading,
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
