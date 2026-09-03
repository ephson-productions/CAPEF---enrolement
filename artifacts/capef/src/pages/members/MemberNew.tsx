import React from 'react';
import { useCreateMember } from '@workspace/api-client-react';
import type { MemberInput } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useOfflineQueue } from '@/lib/offline-sync';
import { useToast } from '@/hooks/use-toast';
import MemberForm, { type MemberFormValues } from './MemberForm';
import ActivityWizard from '@/components/members/ActivityWizard';
import { useTranslation } from 'react-i18next';

export default function MemberNew() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isOnline, enqueueMember } = useOfflineQueue();
  const createMember = useCreateMember();

  const [createdMemberId, setCreatedMemberId] = React.useState<number | null>(null);

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

    if (!isOnline) {
      enqueueMember(payload);
      setLocation('/members');
      return;
    }

    try {
      const res = await createMember.mutateAsync({ data: payload });
      toast({ title: t('common.success', 'Succès'), description: t('members.toast.base_created', 'Enrôlement de base créé avec succès.') });
      setCreatedMemberId(res.id);
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('common.error_occurred', 'Une erreur est survenue lors de la soumission.') });
      enqueueMember(payload);
      setLocation('/members');
    }
  };

  if (createdMemberId !== null) {
    return (
      <div className="space-y-6">
        <div className="mb-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground">{t('activities.next_step_title', 'Étape Suivante : Questionnaire Activité')}</h1>
          <p className="text-muted-foreground mt-1">{t('activities.next_step_subtitle', 'Veuillez compléter le questionnaire lié à l\'activité de ce membre.')}</p>
        </div>
        <ActivityWizard memberId={createdMemberId} onComplete={() => setLocation(`/members/${createdMemberId}`)} />
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
