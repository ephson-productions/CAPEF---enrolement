import React from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetMember, useUpdateMember } from '@workspace/api-client-react';
import type { MemberUpdate } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import MemberForm, { type MemberFormValues } from './MemberForm';
import { useTranslation } from 'react-i18next';

export default function MemberEdit() {
  const { t } = useTranslation();
  const [, params] = useRoute('/members/:id/edit');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = Number(params?.id);

  const { data: member, isLoading, error } = useGetMember(id, {
    query: { enabled: !!id, queryKey: ['member', id] },
  });

  const updateMember = useUpdateMember();

  const onSubmit = async (data: MemberFormValues) => {
    const payload: MemberUpdate = {
      category: data.category as MemberUpdate['category'],
      individualOrOrg: data.memberType === 'physique' ? 'individuel' : 'organisation',
      regionId: data.regionId,
      departmentId: data.departmentId,
      arrondissementId: data.arrondissementId,
      village: data.village,
      gpsLat: data.gpsLat,
      gpsLng: data.gpsLng,
      categoryData: data.categoryData || {},
    };

    if (data.memberType === 'physique') {
      payload.physiqueData = data.physiqueData as MemberUpdate['physiqueData'];
    } else {
      payload.moraleData = data.moraleData as MemberUpdate['moraleData'];
    }

    try {
      await updateMember.mutateAsync({ id, data: payload });
      toast({ title: t('common.success', 'Succès'), description: t('members.toast.updated', 'Enrôlement mis à jour avec succès.') });
      setLocation(`/members/${id}`);
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('members.toast.update_failed', 'Impossible de mettre à jour cet enrôlement.') });
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">{t('common.loading', 'Chargement du formulaire...')}</div>;
  }

  if (error || !member) {
    return <div className="p-8 text-center text-destructive font-bold">{t('members.not_found', 'Membre introuvable.')}</div>;
  }

  return (
    <div>
      <div className="mb-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground">{t('members.edit_title', 'Modifier l\'Enrôlement')}</h1>
        <p className="text-muted-foreground mt-1">{member.memberNumber}</p>
      </div>
      <MemberForm member={member} isSubmitting={updateMember.isPending} onSubmit={onSubmit} submitLabel={t('common.save_changes', 'Enregistrer les modifications')} />
    </div>
  );
}
