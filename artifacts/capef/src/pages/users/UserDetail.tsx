import React, { useEffect, useMemo, useState } from 'react';
import { Link, Redirect, useLocation, useRoute } from 'wouter';
import {
  useDeleteUser,
  useGetUser,
  useListArrondissements,
  useListDepartments,
  useListRegions,
  useUpdateUser,
  useUploadFile,
} from '@workspace/api-client-react';
import type { AppUserStatus, AppUserUpdateRole, ZoneAssignment } from '@workspace/api-client-react';
import { ArrowLeft, Ban, Camera, Check, MapPin, Plus, Save, Trash2, UserRound, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthContext } from '@/lib/auth';
import { useTranslation } from 'react-i18next';

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UserDetail() {
  const { t } = useTranslation();
  const { isAdmin, user: currentUser } = useAuthContext();
  const [, params] = useRoute('/users/:id');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const userId = Number(params?.id);
  const { data: user, isLoading, refetch } = useGetUser(userId, { query: { queryKey: ['user-detail', userId], enabled: isAdmin && Number.isInteger(userId) && userId > 0 } });
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const uploadFile = useUploadFile();
  const { data: regions } = useListRegions();
  const [name, setName] = useState('');
  const [role, setRole] = useState<AppUserUpdateRole>('agent');
  const [status, setStatus] = useState<AppUserStatus>('active');
  const [cniNumber, setCniNumber] = useState('');
  const [cniPhotoUrl, setCniPhotoUrl] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [assignedZones, setAssignedZones] = useState<ZoneAssignment[]>([]);
  const [selectedReg, setSelectedReg] = useState<number | null>(null);
  const [selectedDept, setSelectedDept] = useState<number | null>(null);
  const [selectedArr, setSelectedArr] = useState<number | null>(null);
  const isSelf = currentUser?.id === user?.id;

  const statusLabels: Record<AppUserStatus, string> = {
    active: t('users.status.active', 'Actif'),
    suspended: t('users.status.suspended', 'Suspendu'),
    banned: t('users.status.banned', 'Banni'),
  };

  const { data: departments } = useListDepartments(
    { regionId: selectedReg || undefined },
    { query: { enabled: !!selectedReg, queryKey: ['user-detail-departments', selectedReg] } },
  );
  const { data: arrondissements } = useListArrondissements(
    { departmentId: selectedDept || undefined },
    { query: { enabled: !!selectedDept, queryKey: ['user-detail-arrondissements', selectedDept] } },
  );

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setRole(user.role);
    setStatus(user.status);
    setCniNumber(user.cniNumber || '');
    setCniPhotoUrl(user.cniPhotoUrl || '');
    setProfilePhotoUrl(user.profilePhotoUrl || '');
    setAssignedZones(user.assignedZones || []);
  }, [user]);

  const regionNames = useMemo(() => new Map((regions || []).map((region) => [region.id, region.name])), [regions]);
  const addZone = () => {
    if (!selectedReg) {
      toast({ variant: 'destructive', title: t('users.toast.incomplete_zone', 'Zone incomplète'), description: t('users.toast.select_region_desc', 'Sélectionnez au moins une région.') });
      return;
    }
    const zone = { regionId: selectedReg, departmentId: selectedDept, arrondissementId: selectedArr };
    if (assignedZones.some((item) => item.regionId === zone.regionId && (item.departmentId || null) === (zone.departmentId || null) && (item.arrondissementId || null) === (zone.arrondissementId || null))) {
      toast({ variant: 'destructive', title: t('users.toast.zone_exists', 'Zone déjà ajoutée'), description: t('users.toast.zone_exists_desc', 'Cette combinaison existe déjà.') });
      return;
    }
    setAssignedZones((items) => [...items, zone]);
    setSelectedReg(null);
    setSelectedDept(null);
    setSelectedArr(null);
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>, field: 'cni' | 'profile') => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImage(file);
      const result = await uploadFile.mutateAsync({ data: { fileName: file.name, mimeType: file.type, base64Data: dataUrl.split(',')[1] } });
      if (field === 'cni') setCniPhotoUrl(result.url);
      else setProfilePhotoUrl(result.url);
      toast({ title: t('users.toast.photo_uploaded', 'Photo téléversée'), description: t('users.toast.photo_saved_desc', 'La photo sera enregistrée avec la fiche.') });
    } catch {
      toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('users.toast.upload_failed', 'Impossible de téléverser cette image.') });
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (isSelf && (role !== user.role || JSON.stringify(assignedZones) !== JSON.stringify(user.assignedZones || []))) {
      toast({ variant: 'destructive', title: t('users.toast.mod_refused', 'Modification refusée'), description: t('users.toast.self_mod_desc', 'Vous ne pouvez pas modifier votre propre rôle ou vos zones.') });
      return;
    }
    if (status !== user.status && status !== 'active' && !window.confirm(t('users.confirm_status', `Confirmer la modification de statut de {{name}} ?`, { name: user.name }))) return;
    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: { name, role: isSelf ? undefined : role, status, cniNumber: cniNumber || null, cniPhotoUrl: cniPhotoUrl || null, profilePhotoUrl: profilePhotoUrl || null, assignedZones: isSelf ? undefined : assignedZones },
      });
      await refetch();
      toast({ title: t('users.toast.user_updated', 'Fiche mise à jour'), description: t('users.toast.user_updated_desc', 'Les informations de l’utilisateur ont été enregistrées.') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: error?.response?.data?.error || t('users.toast.update_failed', 'Impossible de mettre à jour la fiche.') });
    }
  };

  const remove = async () => {
    if (!user || !window.confirm(t('users.confirm_delete', `Supprimer définitivement le compte de {{name}} ? Cette action supprimera aussi son identité Clerk.`, { name: user.name }))) return;
    try {
      await deleteUser.mutateAsync({ id: user.id });
      toast({ title: t('users.toast.user_deleted', 'Utilisateur supprimé'), description: t('users.toast.user_deleted_desc', 'Le compte ne pourra pas être recréé automatiquement.') });
      setLocation('/users');
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('users.toast.delete_failed', 'Suppression impossible'), description: error?.response?.data?.error || t('users.toast.delete_failed_desc', 'Le compte n’a pas été supprimé.') });
    }
  };

  if (!isAdmin) return <Redirect to="/dashboard" />;
  if (isLoading) return <div className="mx-auto max-w-4xl animate-pulse space-y-4"><div className="h-8 w-64 rounded bg-muted" /><div className="h-96 rounded-xl bg-muted" /></div>;
  if (!user) return <div className="space-y-4"><Link href="/users" className="inline-flex items-center text-muted-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back', 'Retour')}</Link><p className="text-muted-foreground">{t('users.not_found', 'Utilisateur introuvable.')}</p></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/users" className="inline-flex items-center font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> {t('users.back_to_list', 'Retour à la liste')}</Link>
        <button type="button" onClick={remove} disabled={deleteUser.isPending} className="inline-flex items-center gap-2 rounded-md border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-4 w-4" /> {t('common.delete', 'Supprimer')}</button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('users.user_profile', 'Fiche utilisateur')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('users.admin_only_note', 'Les changements d’accès sont réservés aux administrateurs.')}</p>
      </div>

      <form onSubmit={save} className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-center">
          <div className="relative">
            {profilePhotoUrl ? <img src={profilePhotoUrl} alt="" className="h-24 w-24 rounded-full object-cover ring-4 ring-primary/10" /> : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary"><UserRound /></div>}
            <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-primary p-2 text-primary-foreground shadow hover:bg-primary/90"><Camera className="h-4 w-4" /><input type="file" accept="image/*" className="hidden" onChange={(event) => upload(event, 'profile')} /></label>
          </div>
          <div><h2 className="text-xl font-bold">{user.name}</h2><p className="text-sm text-muted-foreground">{user.email}</p><p className="mt-1 text-xs text-muted-foreground">{t('users.clerk_id', 'Identifiant Clerk :')} {user.clerkUserId}</p></div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium">{t('users.form.full_name', 'Nom complet')}<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm" required /></label>
          <label className="text-sm font-medium">{t('users.form.email', 'Email')} <span className="font-normal text-muted-foreground">({t('users.form.clerk_synced', 'synchronisé depuis Clerk')})</span><input value={user.email} readOnly className="mt-1 w-full cursor-not-allowed rounded-md border border-input bg-muted p-2.5 text-sm text-muted-foreground" /></label>
          <label className="text-sm font-medium">{t('users.form.role', 'Rôle')}
            <select value={role} disabled={isSelf} onChange={(event) => setRole(event.target.value as AppUserUpdateRole)} className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm disabled:cursor-not-allowed disabled:bg-muted">
              <option value="agent">{t('users.roles.agent', 'Agent de terrain')}</option><option value="supervisor">{t('users.roles.supervisor', 'Superviseur régional')}</option><option value="admin">{t('users.roles.admin', 'Administrateur')}</option>
            </select>
          </label>
          <label className="text-sm font-medium">{t('users.form.status', 'Statut')}
            <select value={status} onChange={(event) => setStatus(event.target.value as AppUserStatus)} className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm">
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {isSelf && <p className="text-xs text-muted-foreground md:col-span-2">{t('users.self_locked_note', 'Votre propre rôle et vos zones sont verrouillés. Utilisez « Mon profil » pour vos documents et photos.')}</p>}
        </div>

        <div className="grid gap-5 border-t border-border pt-5 md:grid-cols-2">
          <label className="text-sm font-medium">{t('users.form.cni_number', 'Numéro de CNI')}<input value={cniNumber} onChange={(event) => setCniNumber(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm" placeholder={t('users.form.cni_placeholder', 'Numéro d’identité')} /></label>
          <div className="text-sm font-medium">{t('users.form.cni_photo', 'Photo de CNI')}
            <div className="mt-1 flex items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5"><Camera className="h-4 w-4" /> {t('common.choose_photo', 'Choisir une photo')}<input type="file" accept="image/*" className="hidden" onChange={(event) => upload(event, 'cni')} /></label>{cniPhotoUrl && <img src={cniPhotoUrl} alt="CNI" className="h-12 w-20 rounded border object-cover" />}</div>
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <div><h3 className="font-bold">{t('users.assigned_zones', 'Zones assignées')}</h3><p className="text-xs text-muted-foreground">{t('users.zones_help', 'Ajoutez plusieurs combinaisons région, département et arrondissement.')}</p></div>
          <div className="grid gap-3 sm:grid-cols-4">
            <select disabled={isSelf} value={selectedReg || ''} onChange={(event) => { setSelectedReg(event.target.value ? Number(event.target.value) : null); setSelectedDept(null); setSelectedArr(null); }} className="rounded-md border border-input bg-background p-2 text-xs disabled:bg-muted"><option value="">{t('members.filters.region', 'Région')}</option>{regions?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select disabled={isSelf || !selectedReg} value={selectedDept || ''} onChange={(event) => { setSelectedDept(event.target.value ? Number(event.target.value) : null); setSelectedArr(null); }} className="rounded-md border border-input bg-background p-2 text-xs disabled:bg-muted"><option value="">{t('users.all_departments', 'Tous les départements')}</option>{departments?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select disabled={isSelf || !selectedDept} value={selectedArr || ''} onChange={(event) => setSelectedArr(event.target.value ? Number(event.target.value) : null)} className="rounded-md border border-input bg-background p-2 text-xs disabled:bg-muted"><option value="">{t('users.all_arrondissements', 'Tous les arrondissements')}</option>{arrondissements?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <button type="button" disabled={isSelf} onClick={addZone} className="inline-flex items-center justify-center gap-1 rounded-md bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> {t('common.add', 'Ajouter')}</button>
          </div>
          <div className="space-y-2">
            {!assignedZones.length && <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">{t('users.no_zones', 'Aucune zone spécifique assignée.')}</p>}
            {assignedZones.map((zone, index) => <div key={`${zone.regionId}-${zone.departmentId}-${zone.arrondissementId}-${index}`} className="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2 text-xs"><span><MapPin className="mr-1 inline h-3.5 w-3.5 text-primary" />{regionNames.get(zone.regionId) || `${t('members.filters.region', 'Région')} #${zone.regionId}`} {zone.departmentId ? `· ${t('members.filters.department', 'Département')} #${zone.departmentId}` : `· ${t('users.all_departments', 'Tous les départements')}`} {zone.arrondissementId ? `· ${t('members.filters.arrondissement', 'Arrondissement')} #${zone.arrondissementId}` : ''}</span><button type="button" disabled={isSelf} onClick={() => setAssignedZones((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="text-destructive disabled:opacity-50"><X className="h-4 w-4" /></button></div>)}
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-5"><button type="submit" disabled={updateUser.isPending || uploadFile.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Save className="h-4 w-4" /> {updateUser.isPending ? t('common.saving', 'Enregistrement…') : t('common.save_changes', 'Enregistrer les modifications')}</button></div>
      </form>
    </div>
  );
}
