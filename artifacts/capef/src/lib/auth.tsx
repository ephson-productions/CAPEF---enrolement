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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useUser();
  const { data: user, isLoading: isMeLoading, refetch } = useGetMe({
    query: {
      enabled: !!isSignedIn,
      retry: false,
      queryKey: ['auth-me']
    }
  });

  const isLoading = !!(isMeLoading && isSignedIn);
  const role = user?.role || null;

  const value = {
    user,
    isLoading,
    role,
    isAdmin: role === 'admin',
    isSupervisor: role === 'supervisor',
    isAgent: role === 'agent',
    refetch,
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
