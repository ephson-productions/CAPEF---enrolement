import React, { useState } from 'react';
import { useAuthContext } from '@/lib/auth';
import { Mail, Shield, MapPin, Calendar, Edit, Save, X, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useUpdateUser } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import ImageUploadField from '@/components/shared/ImageUploadField';

export default function Profile() {
  const { user, isLoading, refetch: refetchAuth } = useAuthContext();
  const { toast } = useToast();
  const updateUserMutation = useUpdateUser();

  const [isEditing, setIsEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [cniNumber, setCniNumber] = useState('');
  const [cniPhotoUrl, setCniPhotoUrl] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  if (isLoading || !user) {
    return <div className="animate-pulse p-8">Chargement...</div>;
  }

  const startEdit = () => {
    setEmail(user.email);
    setCniNumber(user.cniNumber || '');
    setCniPhotoUrl(user.cniPhotoUrl || null);
    setProfilePhotoUrl(user.profilePhotoUrl || null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    try {
      await updateUserMutation.mutateAsync({
        id: user.id,
        data: {
          email,
          cniNumber: cniNumber || null,
          cniPhotoUrl: cniPhotoUrl || null,
          profilePhotoUrl: profilePhotoUrl || null,
        }
      });
      toast({ title: 'Profil mis à jour', description: 'Vos informations personnelles ont été enregistrées avec succès.' });
      setIsEditing(false);
      refetchAuth(); // refresh auth context
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e.message || 'Échec de la mise à jour.' });
    }
  };

  const getRoleName = (role: string) => {
    if (role === 'admin') return 'Administrateur Système';
    if (role === 'supervisor') return 'Superviseur Régional';
    return 'Agent de Terrain';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 text-foreground">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mon Profil</h1>
          <p className="text-sm text-muted-foreground mt-1">Vos informations de compte et d'accès.</p>
        </div>
        {!isEditing ? (
          <button
            onClick={startEdit}
            className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 flex items-center gap-1.5 shadow-sm text-sm"
          >
            <Edit className="h-4 w-4" /> Modifier profil
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={cancelEdit}
              className="px-4 py-2 border border-input bg-background hover:bg-muted font-semibold rounded-md flex items-center gap-1.5 text-sm"
            >
              <X className="h-4 w-4" /> Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={updateUserMutation.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 flex items-center gap-1.5 shadow-sm text-sm disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {updateUserMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-8 flex flex-col md:flex-row items-center gap-8 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
          {user.profilePhotoUrl ? (
            <img src={user.profilePhotoUrl} alt={user.name} className="h-28 w-28 rounded-full object-cover shadow-lg border-2 border-primary" />
          ) : (
            <div className="h-28 w-28 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-4xl font-bold shadow-lg">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-center md:text-left">
            <h2 className="text-3xl font-bold text-foreground">{user.name}</h2>
            <p className="text-lg text-muted-foreground">{getRoleName(user.role)}</p>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div>
            <h3 className="text-lg font-bold mb-6">Informations de compte</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-muted rounded-lg text-muted-foreground shrink-0">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold text-muted-foreground">Adresse Email</p>
                  {isEditing ? (
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border rounded-md p-1.5 bg-background text-sm"
                    />
                  ) : (
                    <p className="font-medium text-foreground">{user.email}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-muted rounded-lg text-muted-foreground shrink-0">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Niveau d'accès (Lecture seule)</p>
                  <p className="font-medium text-foreground capitalize">{user.role}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-muted rounded-lg text-muted-foreground shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Zones assignées (Lecture seule)</p>
                  <p className="font-medium text-foreground">
                    {user.assignedZones && user.assignedZones.length > 0
                      ? user.assignedZones.map((z: any) => {
                          const parts = [z.regionName];
                          if (z.departmentName) parts.push(z.departmentName);
                          if (z.arrondissementName) parts.push(z.arrondissementName);
                          return parts.join(' > ');
                        }).join(', ')
                      : 'Nationale (Toutes)'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-muted rounded-lg text-muted-foreground shrink-0">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Membre depuis</p>
                  <p className="font-medium text-foreground">
                    {format(new Date(user.createdAt), 'dd MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CNI & Photos section */}
          <div className="border-t border-border pt-8 space-y-6">
            <h3 className="text-lg font-bold">Documents & Identité</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">Numéro de CNI</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={cniNumber}
                    onChange={(e) => setCniNumber(e.target.value)}
                    className="w-full border rounded-md p-1.5 bg-background text-sm"
                  />
                ) : (
                  <p className="font-medium text-foreground">{user.cniNumber || 'Non renseigné'}</p>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4 md:col-span-2">
                  <ImageUploadField
                    label="Photo de Profil"
                    value={profilePhotoUrl}
                    onChange={setProfilePhotoUrl}
                  />
                  <ImageUploadField
                    label="Photo de CNI"
                    value={cniPhotoUrl}
                    onChange={setCniPhotoUrl}
                  />
                </div>
              ) : (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-2">Photo de Profil</p>
                    {user.profilePhotoUrl ? (
                      <div className="aspect-[4/3] rounded-lg border border-border overflow-hidden bg-muted/20 max-w-xs">
                        <img src={user.profilePhotoUrl} alt="Profil" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Aucune photo de profil chargée.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-2">Photo de CNI</p>
                    {user.cniPhotoUrl ? (
                      <div className="aspect-[4/3] rounded-lg border border-border overflow-hidden bg-muted/20 max-w-xs">
                        <img src={user.cniPhotoUrl} alt="CNI" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Aucune photo de CNI chargée.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
