import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useSyncMembers, MemberInput } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

type OfflineQueueContextType = {
  isOnline: boolean;
  queueCount: number;
  enqueueMember: (member: MemberInput) => void;
  syncNow: () => Promise<void>;
  isSyncing: boolean;
};

const OfflineQueueContext = createContext<OfflineQueueContextType | undefined>(undefined);

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const syncMembers = useSyncMembers();
  const isSyncing = syncMembers.isPending;
  const initialLoadDone = useRef(false);

  // Read queue count
  const getQueue = (): MemberInput[] => {
    try {
      const stored = localStorage.getItem('capef_offline_queue');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const updateQueueCount = useCallback(() => {
    setQueueCount(getQueue().length);
  }, []);

  const enqueueMember = useCallback((member: MemberInput) => {
    const queue = getQueue();
    queue.push(member);
    localStorage.setItem('capef_offline_queue', JSON.stringify(queue));
    updateQueueCount();
    toast({
      title: 'Enregistré hors ligne',
      description: 'Les données seront synchronisées automatiquement.',
    });
  }, [toast, updateQueueCount]);

  const syncNow = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;

    try {
      await syncMembers.mutateAsync({ data: { members: queue } });
      localStorage.setItem('capef_offline_queue', JSON.stringify([]));
      updateQueueCount();
      toast({
        title: 'Synchronisation réussie',
        description: `${queue.length} enrôlement(s) synchronisé(s).`,
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
      if (q.length > 0) {
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
      if (q.length > 0) {
        syncNow();
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow, updateQueueCount]);

  return (
    <OfflineQueueContext.Provider value={{ isOnline, queueCount, enqueueMember, syncNow, isSyncing }}>
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
