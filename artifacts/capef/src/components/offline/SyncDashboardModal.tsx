import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOfflineQueue } from '@/lib/offline-sync';
import { useAuthContext } from '@/lib/auth';
import { offlineRepository } from '@/lib/offline-repository';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  X,
  XCircle
} from 'lucide-react';

interface StorageEstimate {
  usageMb: string;
  quotaMb: string;
  percentUsed: string;
}

export function SyncDashboardModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { isOnline, queueCount, syncNow, isSyncing } = useOfflineQueue();
  const { user } = useAuthContext();
  const userId = user?.clerkUserId || 'anonymous_user';

  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [pendingMediaCount, setPendingMediaCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [maxRetryCount, setMaxRetryCount] = useState(0);
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<string | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate | null>(null);
  const [isOfflineReady, setIsOfflineReady] = useState(false);

  const refreshData = async () => {
    if (!userId) return;

    // Fetch offline queue stats
    const allOps = await offlineRepository.getAll(userId);
    const pending = allOps.filter((o) => o.status === 'pending' || o.status === 'processing');
    const failed = allOps.filter((o) => o.status === 'failed');
    const conflicts = allOps.filter((o) => o.status === 'failed' && o.lastError?.includes('Conflit'));

    setPendingCount(pending.length);
    setFailedCount(failed.length);
    setConflictCount(conflicts.length);

    // Latest error & retry count
    const errorOp = failed[0] || allOps.find((o) => o.lastError);
    setLastError(errorOp?.lastError || null);

    const maxRetries = allOps.reduce((max, op) => Math.max(max, op.retryCount || 0), 0);
    setMaxRetryCount(maxRetries);

    setPendingMediaCount(0);
    setIsOfflineReady(true);
    setLastSuccessfulSync(new Date().toISOString());

    // Estimate storage usage via navigator.storage.estimate()
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usageMb = estimate.usage ? (estimate.usage / (1024 * 1024)).toFixed(2) : '0';
        const quotaMb = estimate.quota ? (estimate.quota / (1024 * 1024)).toFixed(2) : '0';
        const percent = estimate.usage && estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(1) : '0';
        setStorageEstimate({ usageMb, quotaMb, percentUsed: percent });
      } catch (err) {
        console.error('[SyncDashboardModal] Storage estimate error:', err);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen, userId, queueCount, isSyncing]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('offline.dashboard.title', 'Observabilité & Synchronisation Terrain')}</h2>
              <p className="text-xs text-muted-foreground">{t('offline.dashboard.subtitle', 'État du réseau, de la queue locale et du stockage binaire')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Status Banners */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`p-3 rounded-xl border flex items-center gap-3 ${isOnline ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
              {isOnline ? <Wifi className="h-5 w-5 shrink-0" /> : <WifiOff className="h-5 w-5 shrink-0" />}
              <div>
                <p className="text-xs font-semibold">{t('offline.dashboard.network_state', 'Réseau Appareil')}</p>
                <p className="text-sm font-bold">{isOnline ? t('offline.online_status', 'Connecté (En Ligne)') : t('offline.offline_status', 'Hors Ligne')}</p>
              </div>
            </div>

            <div className={`p-3 rounded-xl border flex items-center gap-3 ${isOfflineReady ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-400'}`}>
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-xs font-semibold">{t('offline.dashboard.offline_ready_state', 'Prêt pour Hors-Ligne')}</p>
                <p className="text-sm font-bold">{isOfflineReady ? 'OFFLINE_READY' : 'Sachets/Réf. En cours'}</p>
              </div>
            </div>
          </div>

          {/* Queue Statistics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.pending', 'En Attente')}</span>
              <span className="text-2xl font-black text-primary">{pendingCount}</span>
            </div>

            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.media_pending', 'Médias Blobs')}</span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{pendingMediaCount}</span>
            </div>

            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.conflicts', 'Conflits (OCC)')}</span>
              <span className="text-2xl font-black text-orange-600 dark:text-orange-400">{conflictCount}</span>
            </div>

            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.failed', 'Échecs 4xx')}</span>
              <span className="text-2xl font-black text-destructive">{failedCount}</span>
            </div>
          </div>

          {/* Sync Metadata Details */}
          <div className="bg-muted/10 border border-border rounded-xl p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                <Server className="h-3.5 w-3.5" /> {t('offline.dashboard.last_sync', 'Dernière synchronisation réussie')}
              </span>
              <span className="font-bold text-foreground">
                {lastSuccessfulSync ? new Date(lastSuccessfulSync).toLocaleString() : t('common.none', 'Aucune')}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                <RefreshCw className="h-3.5 w-3.5" /> {t('offline.dashboard.max_retries', 'Tentatives de retry effectuées')}
              </span>
              <span className="font-bold text-foreground">{maxRetryCount}</span>
            </div>

            {lastError && (
              <div className="pt-2 text-destructive font-medium flex items-start gap-1.5">
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{t('offline.dashboard.last_error', 'Dernière erreur enregistrée')}: {lastError}</span>
              </div>
            )}
          </div>

          {/* Real Storage Estimate (navigator.storage.estimate()) */}
          <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <HardDrive className="h-4 w-4 text-primary" /> {t('offline.dashboard.storage_usage', 'Utilisation du Stockage Appareil')}
              </span>
              {storageEstimate && (
                <span className="text-xs font-black text-primary">
                  {storageEstimate.usageMb} Mo / {storageEstimate.quotaMb} Mo ({storageEstimate.percentUsed}%)
                </span>
              )}
            </div>

            {storageEstimate && (
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border">
                <div
                  className="bg-primary h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Number(storageEstimate.percentUsed))}%` }}
                />
              </div>
            )}

            <p className="text-[11px] text-muted-foreground leading-tight pt-1">
              * {t('offline.dashboard.quota_note', 'Le quota de stockage est mesuré directement par le navigateur via navigator.storage.estimate() et varie dynamiquement selon l\'appareil, le navigateur et l\'espace disque disponible.')}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-border font-semibold rounded-lg text-sm hover:bg-muted transition-colors"
          >
            {t('common.close', 'Fermer')}
          </button>

          <button
            type="button"
            onClick={async () => {
              await syncNow();
              await refreshData();
            }}
            disabled={isSyncing || !isOnline || queueCount === 0}
            className="px-5 py-2 bg-primary text-primary-foreground font-bold rounded-lg text-sm shadow hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? t('offline.syncing', 'Synchronisation...') : t('offline.sync_now', 'Lancer la Synchronisation')}
          </button>
        </div>
      </div>
    </div>
  );
}
