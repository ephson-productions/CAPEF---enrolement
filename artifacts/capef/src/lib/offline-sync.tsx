import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { offlineRepository } from './offline-repository';
import { syncEngine } from './sync-engine';
import { useTranslation } from 'react-i18next';
import { useAuthUI } from './auth';

type OfflineQueueContextType = {
  isOnline: boolean;
  queueCount: number;
  effectiveUserId: string;
  enqueueMember: (member: any, localId?: string) => void;
  enqueueUpdateMember: (serverId: number, updates: any, expectedVersion: number) => void;
  syncNow: () => Promise<void>;
  isSyncing: boolean;
  enqueueActivityAction: (action: {
    type: 'create_activity' | 'update_activity' | 'delete_activity' | 'create_line_item' | 'update_line_item' | 'delete_line_item';
    memberId: number;
    activityId?: number;
    itemId?: number;
    memberRef?: string;
    activityRef?: string;
    itemRef?: string;
    data?: any;
    _local?: any;
  }) => void;
};

const OfflineQueueContext = createContext<OfflineQueueContextType | undefined>(undefined);

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userId } = useAuthUI();
  const effectiveUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('capef_last_known_user_id') || 'local_user' : 'local_user');

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const initialLoadDone = useRef(false);

  const updateQueueCount = useCallback(async () => {
    const pending = await offlineRepository.getPending(effectiveUserId);
    setQueueCount(pending.length);
  }, [effectiveUserId]);

  const enqueueMember = useCallback(async (member: any, localId?: string) => {
    await offlineRepository.enqueue('create_member', { ...member, localId, _local: { localId } }, effectiveUserId);
    await updateQueueCount();
    toast({
      title: t('offline.toast.saved_offline_title', 'Enregistré hors ligne'),
      description: t('offline.toast.saved_offline_desc', 'Les données d\'enrôlement seront synchronisées automatiquement.'),
    });
  }, [toast, updateQueueCount, t, effectiveUserId]);

  const enqueueUpdateMember = useCallback(async (serverId: number, updates: any, expectedVersion: number) => {
    await offlineRepository.enqueue('update_member', { serverId, updates, version: expectedVersion }, effectiveUserId);
    await updateQueueCount();
    toast({
      title: t('offline.toast.saved_offline_title', 'Enregistré hors ligne'),
      description: t('offline.toast.saved_offline_desc', 'La modification du membre sera synchronisée automatiquement.'),
    });
  }, [toast, updateQueueCount, t, effectiveUserId]);

  const enqueueActivityAction = useCallback(async (action: any) => {
    const type = action.type;
    const memberRef = action.memberRef || action.data?.memberRef || action._local?.memberLocalId;
    const activityRef = action.activityRef || action.data?.activityRef || action._local?.activityLocalId;

    const enrichedPayload = {
      ...action,
      memberRef,
      activityRef,
      _local: {
        ...(action._local || {}),
        memberLocalId: memberRef,
        activityLocalId: activityRef,
        localId: action._local?.localId || action.localId || action.data?.localId,
      },
    };

    await offlineRepository.enqueue(type, enrichedPayload, effectiveUserId);
    await updateQueueCount();
    toast({
      title: t('offline.toast.action_saved_title', 'Action enregistrée hors ligne'),
      description: t('offline.toast.action_saved_desc', 'L\'activité/production sera synchronisée automatiquement.'),
    });
  }, [toast, updateQueueCount, t, effectiveUserId]);

  const syncNow = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const res = await syncEngine.syncNow(effectiveUserId);
      await updateQueueCount();

      if (res.successCount > 0 && !res.hasError) {
        toast({
          title: t('offline.toast.sync_success_title', 'Synchronisation réussie'),
          description: t('offline.toast.sync_success_desc', '{{count}} opération(s) synchronisée(s) avec succès.', { count: res.successCount }),
        });
      } else if (res.hasError) {
        toast({
          variant: 'destructive',
          title: t('offline.toast.sync_deferred_title', 'Synchronisation différée'),
          description: t('offline.toast.sync_deferred_desc', 'Resynchronisation différée due à un problème réseau ou serveur.'),
        });
      }
    } catch (err: any) {
      console.error('[OfflineQueueProvider] Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [effectiveUserId, isSyncing, toast, t, updateQueueCount]);

  useEffect(() => {
    updateQueueCount();

    const handleOnline = async () => {
      setIsOnline(true);
      const isHealthy = await syncEngine.checkOnlineHealth();
      if (isHealthy) {
        syncNow();
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync trigger on app load if online
    if (navigator.onLine && !initialLoadDone.current) {
      initialLoadDone.current = true;
      syncEngine.checkOnlineHealth().then((healthy) => {
        if (healthy) syncNow();
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow, updateQueueCount]);

  return (
    <OfflineQueueContext.Provider value={{ isOnline, queueCount, effectiveUserId, enqueueMember, enqueueUpdateMember, enqueueActivityAction, syncNow, isSyncing }}>
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
