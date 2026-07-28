import React, { useEffect, useRef } from 'react';
import { useUser } from '@clerk/react';
import { useProvisionUser } from '@workspace/api-client-react';

export function ClerkProvisioner() {
  const { user, isLoaded, isSignedIn } = useUser();
  const provisionUser = useProvisionUser();
  const provisionUserRef = useRef(provisionUser);
  provisionUserRef.current = provisionUser;
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoaded && isSignedIn && user && attemptedRef.current !== user.id) {
      attemptedRef.current = user.id;
      const email = user.primaryEmailAddress?.emailAddress || '';
      const name = user.fullName || user.username || email.split('@')[0] || 'Unknown User';

      provisionUserRef.current.mutate(
        { data: { email, name } },
        {
          onError: (err) => {
            console.error('Failed to provision user:', err);
            // Allow retry on next auth state change (e.g. token becomes ready)
            attemptedRef.current = null;
          }
        }
      );
    }
    if (!isSignedIn) {
      attemptedRef.current = null;
    }
  }, [user, isLoaded, isSignedIn]);

  return null;
}
