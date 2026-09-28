import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { customFetch, ApiError } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { offlineRepository } from './offline-repository';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from './auth';

type OfflineQueueContextType = {
  isOnline: boolean;
  queueCount: number;
  enqueueMember: (member: any) => void;
  syncNow: () => Promise<void>;
  isSyncing: boolean;
  enqueueActivityAction: (action: {
    type: 'create_activity' | 'create_line_item' | 'delete_line_item';
    memberId: number;
    activityId?: number;
    itemId?: number;
    data?: any;
  }) => void;
};

const OfflineQueueContext = createContext<OfflineQueueContextType | undefined>(undefined);

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthContext();
  const userId = user?.clerkUserId || null;
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const initialLoadDone = useRef(false);
  const syncLockRef = useRef(false);

  const updateQueueCount = useCallback(async () => {
    try {
      const pending = await offlineRepository.getPending(userId);
      setQueueCount(pending.length);
    } catch (error) {
      console.error('[OfflineQueueProvider] Failed to read local queue:', error);
      setQueueCount(0);
    }
  }, [userId]);

  const enqueueMember = useCallback(async (member: any) => {
    await offlineRepository.enqueue('create_member', member, userId);
    await updateQueueCount();
    toast({
      title: t('offline.toast.saved_offline_title', 'Enregistré hors ligne'),
      description: t('offline.toast.saved_offline_desc', 'Les données d\'enrôlement seront synchronisées automatiquement.'),
    });
  }, [toast, updateQueueCount, t, userId]);

  const enqueueActivityAction = useCallback(async (action: any) => {
    const type = action.type;
    await offlineRepository.enqueue(type, action, userId);
    await updateQueueCount();
    toast({
      title: t('offline.toast.action_saved_title', 'Action enregistrée hors ligne'),
      description: t('offline.toast.action_saved_desc', 'L\'activité/production sera synchronisée automatiquement.'),
    });
  }, [toast, updateQueueCount, t, userId]);

  const syncNow = useCallback(async () => {
    if (syncLockRef.current || !navigator.onLine) return;
    syncLockRef.current = true;
    try {
      const pendingItems = await offlineRepository.getPending(userId);
      if (pendingItems.length === 0) return;

      setIsSyncing(true);
      let successCount = 0;
      let hasNetworkOrServerError = false;

      for (const item of pendingItems) {
        await offlineRepository.updateStatus(item.id, 'processing', undefined, userId);
        try {
          const headers: Record<string, string> = {
            'X-Client-Operation-ID': item.clientOperationId,
          };

          if (item.operationType === 'create_member') {
            await customFetch('/api/members', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ...item.payload,
                clientOperationId: item.clientOperationId,
              }),
            });
          } else if (item.operationType === 'create_activity') {
            const { memberId, data } = item.payload;
            await customFetch(`/api/members/${memberId}/activities`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ...data,
                clientOperationId: item.clientOperationId,
              }),
            });
          } else if (item.operationType === 'create_line_item') {
            const { memberId, activityId, data } = item.payload;
            await customFetch(`/api/members/${memberId}/activities/${activityId}/line-items`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ...data,
                clientOperationId: item.clientOperationId,
              }),
            });
          } else if (item.operationType === 'delete_line_item') {
            const { memberId, activityId, itemId } = item.payload;
            await customFetch(`/api/members/${memberId}/activities/${activityId}/line-items/${itemId}`, {
              method: 'DELETE',
              headers,
            });
          }

          await offlineRepository.remove(item.id, userId);
          successCount++;
        } catch (err: any) {
          const errorMsg = err?.message || t('offline.sync_error', 'Erreur de synchronisation');
          let status = 0;
          if (err instanceof ApiError) {
            status = err.status;
          } else if (err?.status) {
            status = err.status;
          }

          const isConflictError = status === 409;
          const isTerminalError = status >= 400 && status < 500;

          if (isConflictError) {
            await offlineRepository.updateStatus(item.id, 'failed', `Conflit OCC (409): ${errorMsg}`, userId);
            toast({
              variant: 'destructive',
              title: t('offline.toast.conflict_title', 'Conflit de modification (409)'),
              description: t('offline.toast.conflict_desc', 'Le membre a été modifié sur le serveur par un autre agent. Veuillez réviser la fiche.'),
            });
          } else if (isTerminalError) {
            await offlineRepository.updateStatus(item.id, 'failed', errorMsg, userId);
            toast({
              variant: 'destructive',
              title: t('offline.toast.val_failed_title', 'Échec de validation de l\'action'),
              description: t('offline.toast.val_failed_desc', 'L\'opération a été rejetée par le serveur ({{error}}).', { error: errorMsg }),
            });
          } else {
            await offlineRepository.incrementRetry(item.id, errorMsg, userId);
            hasNetworkOrServerError = true;
            toast({
              variant: 'destructive',
              title: t('offline.toast.sync_deferred_title', 'Synchronisation différée'),
              description: t('offline.toast.sync_deferred_desc', 'Resynchronisation différée due à un problème réseau.'),
            });
            break;
          }
        }
      }

     await updateQueueCount();
     setIsSyncing(false);

      if (successCount > 0 && !hasNetworkOrServerError) {
        toast({
          title: t('offline.toast.sync_success_title', 'Synchronisation réussie'),
          description: t('offline.toast.sync_success_desc', '{{count}} opération(s) synchronisée(s) avec succès.', { count: successCount }),
        });
      }
    } catch (error) {
      console.error('[OfflineQueueProvider] Sync cycle failed:', error);
    } finally {
      setIsSyncing(false);
      syncLockRef.current = false;
    }
  }, [toast, updateQueueCount, t, userId]);

  useEffect(() => {
    void updateQueueCount();

    const handleOnline = async () => {
      setIsOnline(true);
      const pending = await offlineRepository.getPending(userId);
      if (pending.length > 0) {
        void syncNow();
      }
    };

    const handleOffline = () => setIsOnline(false);
    const handleResume = () => {
      if (navigator.onLine) void syncNow();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pageshow', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    // Initial sync if online
    if (navigator.onLine && !initialLoadDone.current) {
      initialLoadDone.current = true;
      offlineRepository.getPending(userId).then((pending) => {
        if (pending.length > 0) {
          void syncNow();
        }
      }).catch((error) => {
        console.error('[OfflineQueueProvider] Initial queue restore failed:', error);
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pageshow', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [syncNow, updateQueueCount, userId]);

  return (
    <OfflineQueueContext.Provider value={{ isOnline, queueCount, enqueueMember, enqueueActivityAction, syncNow, isSyncing }}>
      {children}
      {!isOnline && (
        <div className="fixed bottom-0 left-0 right-0 bg-yellow-500 text-yellow-950 p-2 text-center text-sm font-semibold z-50">
          {t('offline.banner_offline', 'Vous êtes actuellement hors ligne. Les enrôlements seront sauvegardés localement.')}
        </div>
      )}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue() {
  const context = useContext(OfflineQueueContext);
  if (context === undefined) {
    throw new Error('useOfflineQueue must be used within an OfflineQueueProvider');
  }
  return context;
}
