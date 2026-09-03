import React, { useState } from 'react';
import { useUpdateMyProfile, useUploadFile } from '@workspace/api-client-react';
import { Calendar, Camera, CheckCircle2, Mail, MapPin, Shield, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuthContext } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { useDateLocale } from '@/lib/i18n';

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { user, isLoading } = useAuthContext();
  const { toast } = useToast();
  const updateProfile = useUpdateMyProfile();
  const uploadFile = useUploadFile();
  const [cniNumber, setCniNumber] = useState(user?.cniNumber || '');
  const [cniPhotoUrl, setCniPhotoUrl] = useState(user?.cniPhotoUrl || '');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(user?.profilePhotoUrl || '');

  React.useEffect(() => {
    if (!user) return;
    setCniNumber(user.cniNumber || '');
    setCniPhotoUrl(user.cniPhotoUrl || '');
    setProfilePhotoUrl(user.profilePhotoUrl || '');
  }, [user]);

  if (isLoading || !user) return <div className="animate-pulse p-8">{t('common.loading', 'Chargement...')}</div>;

  const getRoleName = (role: string) => {
    if (role === 'admin') return t('users.roles.admin', 'Administrateur Système');
    if (role === 'supervisor') return t('users.roles.supervisor', 'Superviseur Régional');
    return t('users.roles.agent', 'Agent de Terrain');
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>, field: 'cni' | 'profile') => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImage(file);
      const result = await uploadFile.mutateAsync({ data: { fileName: file.name, mimeType: file.type, base64Data: dataUrl.split(',')[1] } });
      if (field === 'cni') setCniPhotoUrl(result.url);
      else setProfilePhotoUrl(result.url);
      toast({ title: t('users.toast.photo_uploaded', 'Photo téléversée'), description: t('profile.save_to_confirm', 'Cliquez sur Enregistrer pour confirmer.') });
    } catch {
      toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('users.toast.upload_failed', 'Impossible de téléverser cette image.') });
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateProfile.mutateAsync({ data: { cniNumber: cniNumber || null, cniPhotoUrl: cniPhotoUrl || null, profilePhotoUrl: profilePhotoUrl || null } });
      toast({ title: t('profile.updated_title', 'Profil mis à jour'), description: t('profile.updated_desc', 'Vos documents et votre photo ont été enregistrés.') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: error?.response?.data?.error || t('profile.update_failed', 'Impossible de mettre à jour votre profil.') });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div><h1 className="text-2xl font-bold text-foreground">{t('navigation.profile', 'Mon profil')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('profile.subtitle', 'Gérez uniquement vos documents et votre photo personnelle.')}</p></div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm text-foreground">{t('profile.preferences_title', 'Préférences de langue')}</h3>
            <p className="text-xs text-muted-foreground">{t('profile.preferences_desc', 'Choisissez la langue d\'affichage de l\'application.')}</p>
          </div>
        </div>
        <LanguageToggle />
      </div>

      <form onSubmit={save} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col items-center gap-6 border-b border-border bg-gradient-to-br from-primary/5 to-transparent p-8 sm:flex-row">
          <div className="relative">
            {profilePhotoUrl ? <img src={profilePhotoUrl} alt={`Photo de ${user.name}`} className="h-28 w-28 rounded-full object-cover shadow-lg ring-4 ring-primary/10" /> : <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-4xl font-bold text-primary-foreground shadow-lg">{user.name.charAt(0).toUpperCase()}</div>}
            <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-primary p-2.5 text-primary-foreground shadow transition hover:bg-primary/90"><Camera className="h-4 w-4" /><input type="file" accept="image/*" className="hidden" onChange={(event) => upload(event, 'profile')} /></label>
          </div>
          <div className="text-center sm:text-left"><h2 className="text-3xl font-bold text-foreground">{user.name}</h2><p className="text-lg text-muted-foreground">{getRoleName(user.role)}</p><p className="mt-1 text-xs text-muted-foreground">{t('profile.photo_hint', 'Photo de profil modifiable ci-dessus')}</p></div>
        </div>

        <div className="space-y-7 p-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex items-start gap-4"><div className="shrink-0 rounded-lg bg-muted p-2.5 text-muted-foreground"><Mail className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-muted-foreground">{t('users.form.email', 'Adresse email')}</p><p className="font-medium text-foreground">{user.email}</p><p className="text-xs text-muted-foreground">{t('profile.clerk_email_note', 'Synchronisée depuis Clerk, non modifiable')}</p></div></div>
            <div className="flex items-start gap-4"><div className="shrink-0 rounded-lg bg-muted p-2.5 text-muted-foreground"><Shield className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-muted-foreground">{t('profile.access_level', 'Niveau d’accès')}</p><p className="font-medium capitalize text-foreground">{getRoleName(user.role)}</p><p className="text-xs text-muted-foreground">{t('profile.role_lock_note', 'Votre rôle ne peut pas être modifié ici')}</p></div></div>
            <div className="flex items-start gap-4"><div className="shrink-0 rounded-lg bg-muted p-2.5 text-muted-foreground"><MapPin className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-muted-foreground">{t('users.assigned_zones', 'Zones assignées')}</p><p className="font-medium text-foreground">{user.assignedZones?.length ? `${user.assignedZones.length} ${t('users.combinations', 'combinaison(s)')}` : t('profile.national_regions', 'Toutes les régions (National)')}</p><p className="text-xs text-muted-foreground">{t('profile.zones_lock_note', 'Vos zones ne peuvent pas être modifiées ici')}</p></div></div>
            <div className="flex items-start gap-4"><div className="shrink-0 rounded-lg bg-muted p-2.5 text-muted-foreground"><Calendar className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-muted-foreground">{t('profile.member_since', 'Membre depuis')}</p><p className="font-medium text-foreground">{format(new Date(user.createdAt), 'dd MMMM yyyy', { locale: dateLocale })}</p></div></div>
          </div>

          <div className="space-y-5 border-t border-border pt-6">
            <div><h3 className="text-lg font-bold">{t('profile.personal_docs', 'Mes documents personnels')}</h3><p className="text-sm text-muted-foreground">{t('profile.docs_hint', 'Seuls ces trois champs sont modifiables depuis votre profil.')}</p></div>
            <label className="block text-sm font-medium">{t('users.form.cni_number', 'Numéro de CNI')}<input value={cniNumber} onChange={(event) => setCniNumber(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm" placeholder={t('users.form.cni_placeholder', 'Numéro d’identité')} /></label>
            <div className="text-sm font-medium">{t('users.form.cni_photo', 'Photo de CNI')}<div className="mt-2 flex flex-wrap items-center gap-4"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 px-4 py-3 text-xs font-semibold text-primary hover:bg-primary/5"><Camera className="h-4 w-4" /> {t('common.choose_photo', 'Choisir une photo')}<input type="file" accept="image/*" className="hidden" onChange={(event) => upload(event, 'cni')} /></label>{cniPhotoUrl && <img src={cniPhotoUrl} alt="Photo de la CNI" className="h-20 w-32 rounded-md border object-cover" />}</div></div>
          </div>

          <div className="flex justify-end border-t border-border pt-5"><button type="submit" disabled={updateProfile.isPending || uploadFile.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> {updateProfile.isPending ? t('common.saving', 'Enregistrement…') : t('profile.save_btn', 'Enregistrer mon profil')}</button></div>
        </div>
      </form>
    </div>
  );
}
