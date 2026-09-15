import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { customFetch, ApiError } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { offlineRepository } from './offline-repository';
import { useTranslation } from 'react-i18next';

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const initialLoadDone = useRef(false);

  const updateQueueCount = useCallback(async () => {
    const pending = await offlineRepository.getPending();
    setQueueCount(pending.length);
  }, []);

  const enqueueMember = useCallback(async (member: any) => {
    await offlineRepository.enqueue('create_member', member);
    await updateQueueCount();
    toast({
      title: t('offline.toast.saved_offline_title', 'Enregistré hors ligne'),
      description: t('offline.toast.saved_offline_desc', 'Les données d\'enrôlement seront synchronisées automatiquement.'),
    });
  }, [toast, updateQueueCount, t]);

  const enqueueActivityAction = useCallback(async (action: any) => {
    const type = action.type;
    await offlineRepository.enqueue(type, action);
    await updateQueueCount();
    toast({
      title: t('offline.toast.action_saved_title', 'Action enregistrée hors ligne'),
      description: t('offline.toast.action_saved_desc', 'L\'activité/production sera synchronisée automatiquement.'),
    });
  }, [toast, updateQueueCount, t]);

  const syncNow = useCallback(async () => {
    const pendingItems = await offlineRepository.getPending();
    if (pendingItems.length === 0) return;

    setIsSyncing(true);
    let successCount = 0;
    let hasNetworkOrServerError = false;

    for (const item of pendingItems) {
      await offlineRepository.updateStatus(item.id, 'processing');
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

        // On HTTP 200/201 (Confirmed Server Acknowledgement): Purge item from queue
        await offlineRepository.remove(item.id);
        successCount++;
      } catch (err: any) {
        const errorMsg = err?.message || t('offline.sync_error', 'Erreur de synchronisation');
        let status = 0;
        if (err instanceof ApiError) {
          status = err.status;
        } else if (err?.status) {
          status = err.status;
        }

        // Check if error is terminal (HTTP 400 / 409 / 422 business error) vs retryable (5xx, 0 / network failure)
        const isTerminalError = status >= 400 && status < 500;

        if (isTerminalError) {
          // Terminal business / validation error: update status to 'failed' to prevent infinite retries
          await offlineRepository.updateStatus(item.id, 'failed', errorMsg);
          toast({
            variant: 'destructive',
            title: t('offline.toast.val_failed_title', 'Échec de validation de l\'action'),
            description: t('offline.toast.val_failed_desc', 'L\'opération a été rejetée par le serveur ({{error}}).', { error: errorMsg }),
          });
        } else {
          // Retryable network or 5xx server error: keep item, increment retry count, abort cycle
          await offlineRepository.incrementRetry(item.id, errorMsg);
          hasNetworkOrServerError = true;
          toast({
            variant: 'destructive',
            title: t('offline.toast.sync_deferred_title', 'Synchronisation différée'),
            description: t('offline.toast.sync_deferred_desc', 'Resynchronisation différée due à un problème réseau.'),
          });
          break; // Stop processing further items in this sync cycle
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
  }, [toast, updateQueueCount, t]);

  useEffect(() => {
    updateQueueCount();

    const handleOnline = async () => {
      setIsOnline(true);
      const pending = await offlineRepository.getPending();
      if (pending.length > 0) {
        syncNow();
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync if online
    if (navigator.onLine && !initialLoadDone.current) {
      initialLoadDone.current = true;
      offlineRepository.getPending().then((pending) => {
        if (pending.length > 0) {
          syncNow();
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow, updateQueueCount]);

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
