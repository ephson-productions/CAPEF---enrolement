import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOfflineQueue } from '@/lib/offline-sync';
import { useAuthContext } from '@/lib/auth';
import { offlineRepository } from '@/lib/offline-repository';
import { db, type LocalOfflineOperation, type LocalSyncConflict } from '@/lib/repositories/CapefDexieDatabase';
import { useLocation } from 'wouter';
import { memberRepository } from '@/lib/repositories/MemberRepository';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Server,
  Wifi,
  WifiOff,
  X,
  XCircle,
  Clock,
  ShieldAlert,
  Trash2,
  Edit
} from 'lucide-react';

interface StorageEstimate {
  usageMb: string;
  quotaMb: string;
  percentUsed: string;
  isPersisted: boolean;
  isApproximate: boolean;
  payloadSizeApproxMb: string;
  warningNotice: string | null;
}

export function SyncDashboardModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { isOnline, queueCount, syncNow, isSyncing } = useOfflineQueue();
  const { user } = useAuthContext();
  const lastKnownUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('capef_last_known_user_id') : null;
  const userId = user?.clerkUserId || lastKnownUserId || '';

  const [pendingCount, setPendingCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [pendingMediaCount, setPendingMediaCount] = useState(0);

  const [operationsList, setOperationsList] = useState<LocalOfflineOperation[]>([]);
  const [conflictsList, setConflictsList] = useState<LocalSyncConflict[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [maxRetryCount, setMaxRetryCount] = useState(0);
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<string | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate | null>(null);
  const [isOfflineReady, setIsOfflineReady] = useState(false);

  const fetchStorageEstimate = async (pendingOpsCount: number, mediaCount: number): Promise<StorageEstimate> => {
    let isPersisted = false;
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      try {
        isPersisted = await navigator.storage.persisted();
      } catch (e) {
        console.warn('[SyncDashboardModal] Persisted check failed:', e);
      }
    }

    // Estimate payload size (approx 50 KB per JSON op + 500 KB per media Blob)
    const approxPayloadBytes = pendingOpsCount * 50 * 1024 + mediaCount * 500 * 1024;
    const payloadSizeApproxMb = (approxPayloadBytes / (1024 * 1024)).toFixed(2);

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usageBytes = est.usage || 0;
        const quotaBytes = est.quota || 0;

        const usageMb = (usageBytes / (1024 * 1024)).toFixed(1);
        const quotaMb = (quotaBytes / (1024 * 1024)).toFixed(1);
        const percentVal = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;
        const percentUsed = percentVal.toFixed(1);

        let warningNotice: string | null = null;
        if (percentVal > 80) {
          warningNotice = t('offline.dashboard.quota_warning', 'Attention : Utilisation du stockage supérieure à 80%. Pensez à synchroniser vos données.');
        }

        return {
          usageMb,
          quotaMb,
          percentUsed,
          isPersisted,
          isApproximate: false,
          payloadSizeApproxMb,
          warningNotice,
        };
      } catch (err) {
        console.warn('[SyncDashboardModal] Storage estimate error:', err);
      }
    }

    // Fallback if navigator.storage.estimate is unsupported
    return {
      usageMb: payloadSizeApproxMb,
      quotaMb: '500.0',
      percentUsed: '1.0',
      isPersisted,
      isApproximate: true,
      payloadSizeApproxMb,
      warningNotice: null,
    };
  };

  const refreshData = async () => {
    if (!userId) return;

    // Fetch offline queue stats
    const allOps = await db.operations.where('userId').equals(userId).toArray();
    setOperationsList(allOps);

    const allConflicts = await db.syncConflicts.where('userId').equals(userId).toArray();
    const unresolvedConflicts = allConflicts.filter((c) => c.status === 'unresolved');
    setConflictsList(unresolvedConflicts);

    const pending = allOps.filter((o) => o.status === 'pending' || o.status === 'processing');
    const waiting = allOps.filter((o) => o.status === 'waiting');
    const blocked = allOps.filter((o) => o.status === 'blocked');
    const failed = allOps.filter((o) => o.status === 'failed');
    const conflicts = unresolvedConflicts;

    const mediaPending = await db.media.where('syncStatus').equals('pending').count();

    setPendingCount(pending.length);
    setWaitingCount(waiting.length);
    setBlockedCount(blocked.length);
    setFailedCount(failed.length);
    setConflictCount(conflicts.length);
    setPendingMediaCount(mediaPending);

    const est = await fetchStorageEstimate(pending.length, mediaPending);
    setStorageEstimate(est);
  };

  const handleResolveConflict = async (conflict: LocalSyncConflict, action: 'keep_mine' | 'accept_server' | 'edit_retry') => {
    if (action === 'keep_mine') {
      // 1. Update operation payload version = serverVersion and status = 'pending'
      const op = await db.operations.where({ operationId: conflict.localData?.operationId || conflict.localId, userId }).first() ||
        await db.operations.where('status').equals('blocked').first();

      if (op && op.id) {
        await db.operations.update(op.id, {
          payload: { ...op.payload, version: conflict.serverVersion },
          status: 'pending',
          retryCount: 0,
          lastError: null,
        });
      }

      await db.syncConflicts.update(conflict.id!, { status: 'resolved' });
      await syncNow();
    } else if (action === 'accept_server') {
      // 2. Purge operation and update local Dexie record with serverData
      const op = await db.operations.where({ operationId: conflict.localData?.operationId || conflict.localId, userId }).first();
      if (op && op.id) {
        await db.operations.delete(op.id);
      }

      if (conflict.serverData && conflict.entityType === 'member') {
        await memberRepository.upsertServerMembers(userId, [conflict.serverData]);
      }

      await db.syncConflicts.update(conflict.id!, { status: 'resolved' });
    } else if (action === 'edit_retry') {
      // 3. Mark conflict resolved, remove blocked operation, navigate to edit page
      await db.syncConflicts.update(conflict.id!, { status: 'resolved' });
      const op = await db.operations.where({ operationId: conflict.localData?.operationId || conflict.localId, userId }).first();
      if (op && op.id) {
        await db.operations.delete(op.id);
      }
      onClose();
      setLocation(`/members/${conflict.localId}/edit`);
    }

    await refreshData();
  };

  const handleCancelOperation = async (op: LocalOfflineOperation) => {
    if (confirm(t('offline.dashboard.confirm_cancel_op', 'Êtes-vous sûr de vouloir annuler cette modification ? L\'opération sera retirée de la file sans affecter le serveur.'))) {
      if (op.id) {
        await db.operations.delete(op.id);
      }
      // Record cancellation in audit history
      await db.syncConflicts.put({
        conflictId: crypto.randomUUID(),
        userId,
        entityType: op.operationType.includes('member') ? 'member' : op.operationType.includes('activity') ? 'activity' : 'line_item',
        localId: op.payload._local?.localId || op.payload.localId || 'unknown',
        serverId: op.payload.serverId || null,
        clientVersion: op.payload.version || 1,
        serverVersion: op.payload.version || 1,
        localData: op.payload,
        serverData: { cancelled: true, cancelledAt: new Date().toISOString() },
        status: 'resolved',
        createdAt: new Date().toISOString(),
      });
      await refreshData();
    }
  };

  const handleRetryOperation = async (opId: number) => {
    await db.operations.update(opId, {
      status: 'pending',
      retryCount: 0,
      lastError: null,
    });
    await syncNow();
    await refreshData();
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.pending', 'En Attente')}</span>
              <span className="text-2xl font-black text-primary">{pendingCount}</span>
            </div>

            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.waiting', 'En Attente Parent')}</span>
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{waitingCount}</span>
            </div>

            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.media_pending', 'Médias Blobs')}</span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{pendingMediaCount}</span>
            </div>

            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.conflicts', 'Conflits 409')}</span>
              <span className="text-2xl font-black text-orange-600 dark:text-orange-400">{conflictCount}</span>
            </div>

            <div className="p-3 bg-muted/20 border border-border rounded-xl text-center space-y-1">
              <span className="text-xs text-muted-foreground font-semibold block">{t('offline.dashboard.blocked', 'Bloquées / Dead-letter')}</span>
              <span className="text-2xl font-black text-destructive">{blockedCount + failedCount}</span>
            </div>
          </div>

          {/* Interactive 409 Conflict Resolution Section */}
          {conflictsList.length > 0 && (
            <div className="space-y-3 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
              <h3 className="text-xs font-bold text-orange-900 dark:text-orange-300 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                {t('offline.dashboard.conflict_section', 'Conflits de Version OCC (409) — Choix Utilisateur Requis')}
              </h3>

              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {conflictsList.map((conflict) => (
                  <div key={conflict.conflictId} className="p-3 bg-card border border-orange-200 dark:border-orange-900/50 rounded-lg text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-foreground uppercase">{conflict.entityType} (ID: {conflict.serverId || conflict.localId})</span>
                      <span className="text-[11px] font-mono text-orange-800 dark:text-orange-300">
                        Version Locale: v{conflict.clientVersion} vs Serveur: v{conflict.serverVersion}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleResolveConflict(conflict, 'keep_mine')}
                        className="px-2.5 py-1 bg-primary text-primary-foreground font-bold rounded text-[11px] hover:bg-primary/90"
                      >
                        {t('offline.dashboard.keep_mine', 'Conserver la mienne (Force v' + conflict.serverVersion + ')')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveConflict(conflict, 'accept_server')}
                        className="px-2.5 py-1 bg-secondary text-secondary-foreground font-bold rounded text-[11px] hover:bg-secondary/90"
                      >
                        {t('offline.dashboard.accept_server', 'Prendre la version serveur')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveConflict(conflict, 'edit_retry')}
                        className="px-2.5 py-1 border border-border font-bold rounded text-[11px] hover:bg-muted"
                      >
                        {t('offline.dashboard.edit_retry', 'Modifier puis réessayer')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Error & Dead-letter Queue List */}
          {operationsList.some((op) => op.status === 'blocked' || op.status === 'failed' || op.status === 'waiting' || op.lastError) && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                {t('offline.dashboard.error_details', 'Détail des Opérations Bloquées ou en Erreur (Français)')}
              </h3>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {operationsList
                  .filter((op) => op.status === 'blocked' || op.status === 'failed' || op.status === 'waiting' || op.lastError)
                  .map((op) => (
                    <div key={op.operationId} className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs flex justify-between items-center gap-3">
                      <div className="space-y-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground uppercase">{op.operationType}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/20 text-destructive font-bold">{op.status}</span>
                          <span className="text-[10px] text-muted-foreground">Retries: {op.retryCount}</span>
                        </div>
                        <p className="text-destructive dark:text-red-300 truncate font-mono">{op.lastError || 'Erreur de synchronisation'}</p>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        {(op.status === 'blocked' || op.status === 'failed') && op.id && (
                          <button
                            type="button"
                            onClick={() => handleRetryOperation(op.id!)}
                            className="px-2.5 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg text-xs hover:bg-primary/90 flex items-center gap-1 transition-all"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {t('common.retry', 'Relancer')}
                          </button>
                        )}
                        {op.id && (
                          <button
                            type="button"
                            onClick={() => handleCancelOperation(op)}
                            className="px-2 py-1.5 bg-destructive/20 text-destructive font-bold rounded-lg text-xs hover:bg-destructive/30 flex items-center gap-1 transition-all"
                            title={t('common.cancel', 'Annuler')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

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
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <HardDrive className="h-4 w-4 text-primary" /> {t('offline.dashboard.storage_usage', 'Utilisation du Stockage Appareil')}
                </span>
                {storageEstimate?.isPersisted && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                    Persistent
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshData}
                  className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  title={t('common.refresh', 'Rafraîchir')}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                {storageEstimate && (
                  <span className="text-xs font-black text-primary">
                    {storageEstimate.usageMb} Mo / {storageEstimate.quotaMb} Mo ({storageEstimate.percentUsed}%)
                  </span>
                )}
              </div>
            </div>

            {storageEstimate && (
              <div className="space-y-1.5">
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border">
                  <div
                    className="bg-primary h-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Number(storageEstimate.percentUsed))}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] text-muted-foreground font-medium">
                  <span>Queue en attente : {pendingCount + pendingMediaCount} élément(s)</span>
                  <span>Payload estimé : ~{storageEstimate.payloadSizeApproxMb} Mo</span>
                </div>
                {storageEstimate.warningNotice && (
                  <p className="text-[11px] text-yellow-600 dark:text-yellow-400 font-semibold pt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {storageEstimate.warningNotice}
                  </p>
                )}
              </div>
            )}
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
