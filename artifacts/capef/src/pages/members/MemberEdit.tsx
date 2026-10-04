import React, { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { memberRepository, type LocalMemberWithDetails } from '@/lib/repositories/MemberRepository';
import { useOfflineQueue } from '@/lib/offline-sync';
import { useAuth } from '@clerk/react';
import { useGetMember } from '@workspace/api-client-react';
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

  const isNumericServerId = !isNaN(Number(idOrLocalId)) && Number(idOrLocalId) > 0;
  const numericId = isNumericServerId ? Number(idOrLocalId) : 0;

  const { data: serverMember, isFetching: isServerLoading, error: serverError } = useGetMember(numericId, {
    query: { enabled: isOnline && isNumericServerId && isAuthLoaded && !!isSignedIn, queryKey: ['member', numericId], retry: 2 }
  });

  const [localMember, setLocalMember] = useState<LocalMemberWithDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadLocalMember = async () => {
    try {
      const data = await memberRepository.getMemberById(idOrLocalId, effectiveUserId);
      if (data) {
        setLocalMember(data);
        setLoading(false);
      } else if (!isOnline || !isNumericServerId) {
        setLoading(false);
      }
    } catch (err) {
      console.error('[MemberEdit] Error loading member:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocalMember();
  }, [idOrLocalId, effectiveUserId]);

  useEffect(() => {
    if (serverMember && isOnline) {
      memberRepository.upsertServerMembers(effectiveUserId, [serverMember]).then(() => {
        loadLocalMember().finally(() => setLoading(false));
      });
    }
  }, [serverMember, isOnline]);

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
        updates.moraleData = null;
      } else {
        updates.moraleData = formValues.moraleData;
        updates.physiqueData = null;
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

  if (loading || (isOnline && isNumericServerId && !serverMember && !serverError && (isServerLoading || !isAuthLoaded))) {
    return (
      <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        {t('common.loading', 'Chargement de la fiche membre...')}
      </div>
    );
  }

  if (!localMember) {
    return (
      <div className="p-12 text-center text-muted-foreground space-y-4">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold">{t('members.not_found', 'Membre introuvable')}</h2>
        <Button onClick={() => setLocation('/members')} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back_to_list', 'Retour à la liste')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setLocation(`/members/${idOrLocalId}`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('members.edit_title', 'Modifier la Fiche Membre')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Matricule : {localMember.memberNumber || localMember.localId}</p>
        </div>
      </div>

      <MemberForm
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        submitLabel={t('common.save_changes', 'Enregistrer les modifications')}
      />
    </div>
  );
}
