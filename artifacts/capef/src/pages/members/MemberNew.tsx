import React from 'react';
import { useCreateMember } from '@workspace/api-client-react';
import type { MemberInput } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useOfflineQueue } from '@/lib/offline-sync';
import { useToast } from '@/hooks/use-toast';
import { memberRepository } from '@/lib/repositories/MemberRepository';
import MemberForm, { type MemberFormValues } from './MemberForm';
import ActivityWizard from '@/components/members/ActivityWizard';
import { useTranslation } from 'react-i18next';

export default function MemberNew() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isOnline, enqueueMember, syncNow, effectiveUserId } = useOfflineQueue();
  const createMember = useCreateMember();

  const [createdLocalId, setCreatedLocalId] = React.useState<string | null>(null);

  const onSubmit = async (data: MemberFormValues) => {
    const payload: MemberInput = {
      memberType: data.memberType,
      category: data.category,
      regionId: data.regionId,
      departmentId: data.departmentId,
      arrondissementId: data.arrondissementId,
      village: data.village,
      gpsLat: data.gpsLat,
      gpsLng: data.gpsLng,
      categoryData: data.categoryData || {},
    };

    if (data.memberType === 'physique') {
      payload.physiqueData = data.physiqueData as MemberInput['physiqueData'];
    } else {
      payload.moraleData = data.moraleData as MemberInput['moraleData'];
    }

    const localId = crypto.randomUUID();

    // 1. Write to local IndexedDB MemberRepository first
    await memberRepository.saveLocalMember(effectiveUserId, {
      ...payload,
      localId,
      syncStatus: 'pending',
    });

    // 2. Enqueue the mutation item for sync engine processing
    enqueueMember(payload, localId);

    // 3. Immediately set state to allow user to proceed to Activity Wizard locally
    setCreatedLocalId(localId);

    toast({
      title: t('common.success', 'Succès'),
      description: isOnline
        ? t('members.toast.base_created_online', 'Enrôlement local créé avec succès. Synchronisation en cours.')
        : t('members.toast.base_created_offline', 'Enrôlement enregistré en mode hors ligne.'),
    });

    // 4. In background when online, trigger unified single-path queue sync
    if (isOnline) {
      syncNow().catch((err) => {
        console.warn('[MemberNew] Online sync trigger deferred:', err);
      });
    }
  };

  if (createdLocalId !== null) {
    return (
      <div className="space-y-6">
        <div className="mb-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground">{t('activities.next_step_title', 'Étape Suivante : Questionnaire Activité')}</h1>
          <p className="text-muted-foreground mt-1">{t('activities.next_step_subtitle', 'Veuillez compléter le questionnaire lié à l\'activité de ce membre.')}</p>
        </div>
        <ActivityWizard memberId={createdLocalId} onComplete={() => setLocation(`/members/${createdLocalId}`)} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground">{t('navigation.new_enrollment', 'Nouvel Enrôlement')}</h1>
        <p className="text-muted-foreground mt-1">{t('members.new_enrollment_subtitle', 'Formulaire d\'enregistrement de base d\'un acteur agropastoral.')}</p>
      </div>
      <MemberForm isSubmitting={createMember.isPending} onSubmit={onSubmit} submitLabel={t('activities.proceed_to_wizard', 'Procéder au Questionnaire Activité')} />
    </div>
  );
}
