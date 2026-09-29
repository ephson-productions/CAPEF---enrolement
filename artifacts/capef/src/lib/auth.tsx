import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useGetMe, AppUser } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';
import { localProfileService, type LocalUserProfile, type VerificationStatus } from './local-profile-service';

type AuthContextType = {
  user: AppUser | undefined;
  isLoading: boolean;
  role: string | null;
  isAdmin: boolean;
  isSupervisor: boolean;
  isAgent: boolean;
  verificationStatus: VerificationStatus;
  isExpiredReadonly: boolean;
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
    localStorage.setItem('capef_last_known_user_id', user.clerkUserId);
  } catch (err) {
    console.error('[auth.tsx] Error caching claims for UI gating:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isSignedIn } = useUser();
  const clerkUserId = clerkUser?.id ?? null;
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const effectiveUserId = clerkUserId || (typeof window !== 'undefined' ? localStorage.getItem('capef_last_known_user_id') : null);

  const { data: user, isLoading: isMeLoading, refetch } = useGetMe({
    query: {
      enabled: !!isSignedIn,
      retry: false,
      queryKey: ['auth-me']
    }
  });

  const [localProfile, setLocalProfile] = useState<LocalUserProfile | null>(null);

  // Sync and persist local profile upon online verification
  useEffect(() => {
    if (user && user.clerkUserId) {
      cacheClaimsForUIGatingOnly(user);
      localProfileService.saveProfile({
        serverId: user.id,
        clerkUserId: user.clerkUserId,
        name: user.name,
        email: user.email,
        role: user.role,
        regionId: user.regionId ?? null,
        lastOnlineVerification: new Date().toISOString(),
      }).then((rec) => {
        setLocalProfile({
          serverId: rec.serverId,
          clerkUserId: rec.clerkUserId,
          name: rec.name,
          email: rec.email,
          role: rec.role,
          regionId: rec.regionId,
          lastOnlineVerification: rec.lastOnlineVerification,
          pinHash: rec.pinHash,
          pinSalt: rec.pinSalt,
        });
      }).catch((err) => {
        console.error('[AuthProvider] Error saving local profile:', err);
      });
    }
  }, [user]);

  // Load offline local profile when offline
  useEffect(() => {
    if (!user && effectiveUserId) {
      localProfileService.getProfile(effectiveUserId).then((rec) => {
        if (rec) {
          setLocalProfile({
            serverId: rec.serverId,
            clerkUserId: rec.clerkUserId,
            name: rec.name,
            email: rec.email,
            role: rec.role,
            regionId: rec.regionId,
            lastOnlineVerification: rec.lastOnlineVerification,
            pinHash: rec.pinHash,
            pinSalt: rec.pinSalt,
          });
        }
      }).catch((err) => {
        console.error('[AuthProvider] Error getting local profile:', err);
      });
    }
  }, [user, effectiveUserId]);

  const isLoading = !!(isMeLoading && isSignedIn);

  const offlineCachedClaims = useMemo(() => {
    if (!user && effectiveUserId) {
      return getLocallyCachedRoleForUIGatingOnly(effectiveUserId);
    }
    return null;
  }, [user, effectiveUserId]);

  const role = user?.role || localProfile?.role || offlineCachedClaims?.role || null;

  const verificationStatus: VerificationStatus = useMemo(() => {
    if (user && isSignedIn) {
      return 'verified-online';
    }
    const lastVerification = localProfile?.lastOnlineVerification || offlineCachedClaims?.cachedAt || '';
    return localProfileService.getVerificationStatus(isOnline, lastVerification);
  }, [user, isSignedIn, localProfile, offlineCachedClaims, isOnline]);

  const isExpiredReadonly = verificationStatus === 'expired-readonly';

  const value = {
    user: user || (localProfile ? ({
      id: localProfile.serverId,
      clerkUserId: localProfile.clerkUserId,
      email: localProfile.email,
      name: localProfile.name,
      role: localProfile.role as any,
      status: 'active',
      regionId: localProfile.regionId ?? null,
      createdAt: localProfile.lastOnlineVerification,
    } as AppUser) : (offlineCachedClaims ? ({
      id: 0,
      clerkUserId: effectiveUserId || '',
      email: offlineCachedClaims.email,
      name: offlineCachedClaims.name,
      role: offlineCachedClaims.role as any,
      status: 'active',
      regionId: offlineCachedClaims.assignedRegionId ?? null,
      createdAt: offlineCachedClaims.cachedAt,
    } as AppUser) : undefined)),
    isLoading,
    role,
    isAdmin: role === 'admin',
    isSupervisor: role === 'supervisor',
    isAgent: role === 'agent',
    verificationStatus,
    isExpiredReadonly,
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
