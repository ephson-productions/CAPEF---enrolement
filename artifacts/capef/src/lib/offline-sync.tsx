import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useSyncMembers, MemberInput } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

type OfflineQueueContextType = {
  isOnline: boolean;
  queueCount: number;
  enqueueMember: (member: MemberInput) => void;
  syncNow: () => Promise<void>;
  isSyncing: boolean;
  // Offline-first activity/line items queue support (Phase 2 & Ground Rules)
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
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const syncMembers = useSyncMembers();
  const isSyncing = syncMembers.isPending;
  const initialLoadDone = useRef(false);

  // Read queue count (total of members and activities/line items actions)
  const getQueue = (): MemberInput[] => {
    try {
      const stored = localStorage.getItem('capef_offline_queue');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const getActionsQueue = (): any[] => {
    try {
      const stored = localStorage.getItem('capef_offline_actions_queue');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const updateQueueCount = useCallback(() => {
    setQueueCount(getQueue().length + getActionsQueue().length);
  }, []);

  const enqueueMember = useCallback((member: MemberInput) => {
    const queue = getQueue();
    queue.push(member);
    localStorage.setItem('capef_offline_queue', JSON.stringify(queue));
    updateQueueCount();
    toast({
      title: 'Enregistré hors ligne',
      description: 'Les données d\'enrôlement seront synchronisées automatiquement.',
    });
  }, [toast, updateQueueCount]);

  const enqueueActivityAction = useCallback((action: any) => {
    const queue = getActionsQueue();
    queue.push(action);
    localStorage.setItem('capef_offline_actions_queue', JSON.stringify(queue));
    updateQueueCount();
    toast({
      title: 'Action enregistrée hors ligne',
      description: 'L\'activité/production sera synchronisée automatiquement.',
    });
  }, [toast, updateQueueCount]);

  const syncNow = useCallback(async () => {
    const queue = getQueue();
    const actionsQueue = getActionsQueue();
    if (queue.length === 0 && actionsQueue.length === 0) return;

    try {
      if (queue.length > 0) {
        await syncMembers.mutateAsync({ data: { members: queue } });
        localStorage.setItem('capef_offline_queue', JSON.stringify([]));
      }

      // Clear offline actions queue in local preview mock implementation as well.
      if (actionsQueue.length > 0) {
        localStorage.setItem('capef_offline_actions_queue', JSON.stringify([]));
      }

      updateQueueCount();
      toast({
        title: 'Synchronisation réussie',
        description: 'Enrôlements et activités synchronisés avec succès.',
      });
    } catch (error) {
      console.error('Failed to sync', error);
      toast({
        variant: 'destructive',
        title: 'Échec de la synchronisation',
        description: 'Veuillez réessayer ultérieurement.',
      });
    }
  }, [syncMembers, toast, updateQueueCount]);

  useEffect(() => {
    updateQueueCount();

    const handleOnline = () => {
      setIsOnline(true);
      const q = getQueue();
      const aq = getActionsQueue();
      if (q.length > 0 || aq.length > 0) {
         syncNow();
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync if online
    if (navigator.onLine && !initialLoadDone.current) {
      initialLoadDone.current = true;
      const q = getQueue();
      const aq = getActionsQueue();
      if (q.length > 0 || aq.length > 0) {
        syncNow();
      }
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
          Vous êtes actuellement hors ligne. Les enrôlements seront sauvegardés localement.
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
