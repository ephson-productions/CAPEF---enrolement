import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { memberRepository, type LocalMemberWithDetails } from '@/lib/repositories/MemberRepository';
import { useOfflineQueue } from '@/lib/offline-sync';
import { useAuth } from '@clerk/react';
import { getGetMemberQueryKey, useGetMember } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import MemberForm, { type MemberFormValues } from './MemberForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';

export default function MemberEdit() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/members/:id/edit');
  const idOrLocalId = params?.id || '';

  const { toast } = useToast();
  const { effectiveUserId, isOnline, enqueueUpdateMember } = useOfflineQueue();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const hydratedServerVersion = useRef<string | null>(null);
  const localMemberRef = useRef<LocalMemberWithDetails | null>(null);

  const isNumericServerId = !isNaN(Number(idOrLocalId)) && Number(idOrLocalId) > 0;
  const numericId = isNumericServerId ? Number(idOrLocalId) : 0;

  const { data: serverMember, isFetching: isServerLoading, error: serverError } = useGetMember(numericId, {
    query: {
      enabled: isOnline && isNumericServerId && isAuthLoaded && !!isSignedIn,
      queryKey: getGetMemberQueryKey(numericId),
      refetchOnWindowFocus: false,
      retry: 2,
    }
  });

  const [localMember, setLocalMember] = useState<LocalMemberWithDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isHydratingServer, setIsHydratingServer] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  localMemberRef.current = localMember;

  const loadLocalMember = useCallback(async () => {
    try {
      return await memberRepository.getMemberById(idOrLocalId, effectiveUserId);
    } catch (err) {
      console.error('[MemberEdit] Error loading member:', err);
      return null;
    }
  }, [idOrLocalId, effectiveUserId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLocalMember(null);
    void loadLocalMember().then((data) => {
      if (active) {
        setLocalMember(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [loadLocalMember]);

  useEffect(() => {
    if (!serverMember || !isOnline || serverMember.id !== numericId) return;

    const versionKey = `${serverMember.id}:${serverMember.version}:${serverMember.updatedAt ?? ''}`;
    if (hydratedServerVersion.current === versionKey) return;
    hydratedServerVersion.current = versionKey;

    if (!localMemberRef.current) setIsHydratingServer(true);
    let active = true;
    void memberRepository
      .upsertServerMembers(effectiveUserId, [serverMember])
      .then(() => loadLocalMember())
      .then((data) => {
        if (active) setLocalMember(data);
      })
      .catch((err) => {
        hydratedServerVersion.current = null;
        console.error('[MemberEdit] Error refreshing local member:', err);
      })
      .finally(() => {
        if (active) setIsHydratingServer(false);
      });

    return () => {
      active = false;
      setIsHydratingServer(false);
    };
  }, [serverMember, isOnline, effectiveUserId, numericId, loadLocalMember]);

  const handleSubmit = async (formValues: MemberFormValues) => {
    if (!localMember) return;
    setIsSubmitting(true);

    try {
      const updates: any = {
        memberType: formValues.memberType,
        category: formValues.category,
        regionId: formValues.regionId,
        departmentId: formValues.departmentId,
        arrondissementId: formValues.arrondissementId,
        village: formValues.village,
        gpsLat: formValues.gpsLat,
        gpsLng: formValues.gpsLng,
        categoryData: formValues.categoryData || {},
        syncStatus: 'pending',
      };

      if (formValues.memberType === 'physique') {
        updates.physiqueData = formValues.physiqueData;
      } else {
        updates.moraleData = formValues.moraleData;
      }

      // 1. Write to local MemberRepository
      await memberRepository.updateLocalMember(localMember.localId, effectiveUserId, updates);

      // 2. Enqueue update_member operation
      const serverId = localMember.serverId || Number(idOrLocalId);
      if (!isNaN(serverId) && serverId > 0) {
        enqueueUpdateMember(serverId, updates, localMember.version || 1);
      }

      toast({
        title: t('common.success', 'Succès'),
        description: t('members.toast.updated_local', 'Fiche membre mise à jour localement.'),
      });

      setLocation(`/members/${idOrLocalId}`);
    } catch (err) {
      console.error('[MemberEdit] Submit error:', err);
      toast({
        variant: 'destructive',
        title: t('common.error', 'Erreur'),
        description: t('common.error_occurred', 'Une erreur est survenue lors de la mise à jour.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (
    loading ||
    isHydratingServer ||
    (!localMember &&
      isOnline &&
      isNumericServerId &&
      !serverError &&
      (isServerLoading || !isAuthLoaded))
  ) {
    return (
      <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        {t('common.loading', 'Chargement de la fiche membre...')}
      </div>
    );
  }

  // Determine back navigation link restoring registry filters/pagination context
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const fromParam = searchParams.get('from');
  const registryBackUrl = fromParam
    ? decodeURIComponent(fromParam)
    : (typeof window !== 'undefined' ? sessionStorage.getItem('capef:members-registry-from') : null) || '/members';

  if (!localMember) {
    return (
      <div className="p-12 text-center text-muted-foreground space-y-4">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold">{t('members.not_found', 'Membre introuvable')}</h2>
        <Button onClick={() => setLocation(registryBackUrl)} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back_to_list', 'Retour à la liste')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setLocation(registryBackUrl)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('members.edit_title', 'Modifier la Fiche Membre')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Matricule : {localMember.memberNumber || localMember.localId}</p>
        </div>
      </div>

      <MemberForm
        key={localMember.localId}
        member={localMember}
        isEditing
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        submitLabel={t('common.save_changes', 'Enregistrer les modifications')}
      />
    </div>
  );
}
