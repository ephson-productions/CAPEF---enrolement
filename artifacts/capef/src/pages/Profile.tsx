import React, { useState } from 'react';
import { useUpdateMyProfile, useUploadFile } from '@workspace/api-client-react';
import { Calendar, Camera, CheckCircle2, Mail, MapPin, Shield, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAuthContext } from '@/lib/auth';

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
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

  if (isLoading || !user) return <div className="animate-pulse p-8">Chargement...</div>;

  const getRoleName = (role: string) => role === 'admin' ? 'Administrateur Système' : role === 'supervisor' ? 'Superviseur Régional' : 'Agent de Terrain';

  const upload = async (event: React.ChangeEvent<HTMLInputElement>, field: 'cni' | 'profile') => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImage(file);
      const result = await uploadFile.mutateAsync({ data: { fileName: file.name, mimeType: file.type, base64Data: dataUrl.split(',')[1] } });
      if (field === 'cni') setCniPhotoUrl(result.url);
      else setProfilePhotoUrl(result.url);
      toast({ title: 'Photo téléversée', description: 'Cliquez sur Enregistrer pour confirmer.' });
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de téléverser cette image.' });
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateProfile.mutateAsync({ data: { cniNumber: cniNumber || null, cniPhotoUrl: cniPhotoUrl || null, profilePhotoUrl: profilePhotoUrl || null } });
      toast({ title: 'Profil mis à jour', description: 'Vos documents et votre photo ont été enregistrés.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: error?.response?.data?.error || 'Impossible de mettre à jour votre profil.' });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div><h1 className="text-2xl font-bold text-foreground">Mon profil</h1><p className="mt-1 text-sm text-muted-foreground">Gérez uniquement vos documents et votre photo personnelle.</p></div>

      <form onSubmit={save} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col items-center gap-6 border-b border-border bg-gradient-to-br from-primary/5 to-transparent p-8 sm:flex-row">
          <div className="relative">
            {profilePhotoUrl ? <img src={profilePhotoUrl} alt={`Photo de ${user.name}`} className="h-28 w-28 rounded-full object-cover shadow-lg ring-4 ring-primary/10" /> : <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-4xl font-bold text-primary-foreground shadow-lg">{user.name.charAt(0).toUpperCase()}</div>}
            <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-primary p-2.5 text-primary-foreground shadow transition hover:bg-primary/90"><Camera className="h-4 w-4" /><input type="file" accept="image/*" className="hidden" onChange={(event) => upload(event, 'profile')} /></label>
          </div>
          <div className="text-center sm:text-left"><h2 className="text-3xl font-bold text-foreground">{user.name}</h2><p className="text-lg text-muted-foreground">{getRoleName(user.role)}</p><p className="mt-1 text-xs text-muted-foreground">Photo de profil modifiable ci-dessus</p></div>
        </div>

        <div className="space-y-7 p-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex items-start gap-4"><div className="shrink-0 rounded-lg bg-muted p-2.5 text-muted-foreground"><Mail className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-muted-foreground">Adresse email</p><p className="font-medium text-foreground">{user.email}</p><p className="text-xs text-muted-foreground">Synchronisée depuis Clerk, non modifiable</p></div></div>
            <div className="flex items-start gap-4"><div className="shrink-0 rounded-lg bg-muted p-2.5 text-muted-foreground"><Shield className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-muted-foreground">Niveau d’accès</p><p className="font-medium capitalize text-foreground">{getRoleName(user.role)}</p><p className="text-xs text-muted-foreground">Votre rôle ne peut pas être modifié ici</p></div></div>
            <div className="flex items-start gap-4"><div className="shrink-0 rounded-lg bg-muted p-2.5 text-muted-foreground"><MapPin className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-muted-foreground">Zones assignées</p><p className="font-medium text-foreground">{user.assignedZones?.length ? `${user.assignedZones.length} combinaison(s)` : 'Toutes les régions (National)'}</p><p className="text-xs text-muted-foreground">Vos zones ne peuvent pas être modifiées ici</p></div></div>
            <div className="flex items-start gap-4"><div className="shrink-0 rounded-lg bg-muted p-2.5 text-muted-foreground"><Calendar className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-muted-foreground">Membre depuis</p><p className="font-medium text-foreground">{format(new Date(user.createdAt), 'dd MMMM yyyy', { locale: fr })}</p></div></div>
          </div>

          <div className="space-y-5 border-t border-border pt-6">
            <div><h3 className="text-lg font-bold">Mes documents personnels</h3><p className="text-sm text-muted-foreground">Seuls ces trois champs sont modifiables depuis votre profil.</p></div>
            <label className="block text-sm font-medium">Numéro de CNI<input value={cniNumber} onChange={(event) => setCniNumber(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm" placeholder="Numéro d’identité" /></label>
            <div className="text-sm font-medium">Photo de CNI<div className="mt-2 flex flex-wrap items-center gap-4"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 px-4 py-3 text-xs font-semibold text-primary hover:bg-primary/5"><Camera className="h-4 w-4" /> Choisir une photo<input type="file" accept="image/*" className="hidden" onChange={(event) => upload(event, 'cni')} /></label>{cniPhotoUrl && <img src={cniPhotoUrl} alt="Photo de la CNI" className="h-20 w-32 rounded-md border object-cover" />}</div></div>
          </div>

          <div className="flex justify-end border-t border-border pt-5"><button type="submit" disabled={updateProfile.isPending || uploadFile.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> {updateProfile.isPending ? 'Enregistrement…' : 'Enregistrer mon profil'}</button></div>
        </div>
      </form>
    </div>
  );
}