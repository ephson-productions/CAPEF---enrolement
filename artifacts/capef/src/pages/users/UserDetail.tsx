import React, { useState, useEffect } from 'react';
import {
  useGetUser,
  useUpdateUser,
  useDeleteUser,
  useListRegions,
  useListDepartments,
  useListArrondissements
} from '@workspace/api-client-react';
import { useRoute, useLocation, Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Edit, Save, X, Shield, Mail, Calendar, User, FileText, Trash2, ShieldAlert,
  MapPin, Plus, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import ImageUploadField from '@/components/shared/ImageUploadField';

export default function UserDetail() {
  const [, params] = useRoute('/users/:id');
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: user, isLoading, error, refetch } = useGetUser(id, {
    query: { enabled: !!id, queryKey: ['user', id] }
  });

  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'supervisor' | 'agent'>('agent');
  const [cniNumber, setCniNumber] = useState('');
  const [cniPhotoUrl, setCniPhotoUrl] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'suspended' | 'banned'>('active');

  // Zone Selection States
  const [selectedReg, setSelectedReg] = useState<number | null>(null);
  const [selectedDept, setSelectedDept] = useState<number | null>(null);
  const [selectedArr, setSelectedArr] = useState<number | null>(null);
  const [assignedZones, setAssignedZones] = useState<any[]>([]);

  const { data: regions } = useListRegions();
  const { data: departments } = useListDepartments(
    { regionId: selectedReg || undefined },
    { query: { enabled: !!selectedReg, queryKey: ['departments', selectedReg] } }
  );
  const { data: arrondissements } = useListArrondissements(
    { departmentId: selectedDept || undefined },
    { query: { enabled: !!selectedDept, queryKey: ['arrondissements', selectedDept] } }
  );

  // Modals / Confirmations States
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role as any);
      setCniNumber(user.cniNumber || '');
      setCniPhotoUrl(user.cniPhotoUrl || null);
      setProfilePhotoUrl(user.profilePhotoUrl || null);
      setStatus(user.status || 'active');
      setAssignedZones(user.assignedZones || []);
    }
  }, [user]);

  if (isLoading) {
    return <div className="animate-pulse p-8">Chargement de la fiche utilisateur...</div>;
  }

  if (error || !user) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-destructive font-semibold">Utilisateur introuvable ou erreur de chargement.</p>
        <Link href="/users" className="text-primary hover:underline">Retourner à la liste</Link>
      </div>
    );
  }

  const handleAddZone = () => {
    if (!selectedReg) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Veuillez sélectionner au moins une région.' });
      return;
    }

    const regObj = regions?.find(r => r.id === selectedReg);
    const deptObj = departments?.find(d => d.id === selectedDept);
    const arrObj = arrondissements?.find(a => a.id === selectedArr);

    const duplicate = assignedZones.some(
      z => z.regionId === selectedReg &&
           z.departmentId === (selectedDept || null) &&
           z.arrondissementId === (selectedArr || null)
    );

    if (duplicate) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Cette zone est déjà ajoutée.' });
      return;
    }

    setAssignedZones([...assignedZones, {
      regionId: selectedReg,
      departmentId: selectedDept || null,
      arrondissementId: selectedArr || null,
      regionName: regObj?.name,
      departmentName: deptObj?.name,
      arrondissementName: arrObj?.name,
    }]);

    setSelectedReg(null);
    setSelectedDept(null);
    setSelectedArr(null);
  };

  const handleRemoveZone = (index: number) => {
    setAssignedZones(assignedZones.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    try {
      await updateUserMutation.mutateAsync({
        id,
        data: {
          name,
          email,
          role,
          cniNumber: cniNumber || null,
          cniPhotoUrl: cniPhotoUrl || null,
          profilePhotoUrl: profilePhotoUrl || null,
          status,
          assignedZones: assignedZones.map(z => ({
            regionId: z.regionId,
            departmentId: z.departmentId || null,
            arrondissementId: z.arrondissementId || null,
          })),
        }
      });
      toast({ title: 'Succès', description: 'Fiche utilisateur enregistrée avec succès.' });
      setIsEditing(false);
      refetch();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e.message || 'Échec de l\'enregistrement.' });
    }
  };

  const handleStatusChange = async (newStatus: 'active' | 'suspended' | 'banned') => {
    try {
      await updateUserMutation.mutateAsync({
        id,
        data: { status: newStatus }
      });
      toast({ title: 'Statut mis à jour', description: `L'utilisateur est maintenant ${newStatus === 'active' ? 'actif' : newStatus === 'suspended' ? 'suspendu' : 'banni'}.` });
      refetch();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Échec du changement de statut.' });
    }
  };

  const handleDeleteUser = async () => {
    try {
      await deleteUserMutation.mutateAsync({ id });
      toast({ title: 'Supprimé', description: 'L\'utilisateur a été supprimé avec succès.' });
      setLocation('/users');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Échec de la suppression de l\'utilisateur.' });
    }
  };

  const getRoleName = (role: string) => {
    if (role === 'admin') return 'Administrateur Système';
    if (role === 'supervisor') return 'Superviseur Régional';
    return 'Agent de Terrain';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-foreground pb-12">
      {/* Header back link */}
      <div className="flex items-center justify-between">
        <Link href="/users" className="text-sm font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Retour à la liste
        </Link>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 flex items-center gap-1.5 shadow-sm text-sm"
              >
                <Edit className="h-4 w-4" /> Modifier Fiche
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 bg-destructive/10 text-destructive font-semibold rounded-md hover:bg-destructive/20 flex items-center gap-1.5 text-sm"
              >
                <Trash2 className="h-4 w-4" /> Supprimer
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setIsEditing(false); refetch(); }}
                className="px-4 py-2 border border-input bg-background hover:bg-muted font-semibold rounded-md flex items-center gap-1.5 text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={updateUserMutation.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 flex items-center gap-1.5 shadow-sm text-sm disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {updateUserMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Quick Identity / Photos */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border shadow-sm p-6 text-center space-y-4">
            {profilePhotoUrl ? (
              <img src={profilePhotoUrl} alt={name} className="h-28 w-28 rounded-full object-cover shadow-lg border-2 border-primary mx-auto" />
            ) : (
              <div className="h-28 w-28 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-4xl font-bold shadow-lg mx-auto">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-foreground">{name}</h2>
              <p className="text-sm text-muted-foreground">{getRoleName(role)}</p>
            </div>

            {/* Status indicators */}
            <div className="pt-2">
              {status === 'active' && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200 uppercase">Actif</span>
              )}
              {status === 'suspended' && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase">Suspendu</span>
              )}
              {status === 'banned' && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200 uppercase">Banni</span>
              )}
            </div>

            {/* Quick Status actions */}
            {!isEditing && (
              <div className="pt-4 border-t border-border flex flex-col gap-2">
                {status === 'active' ? (
                  <>
                    <button
                      onClick={() => handleStatusChange('suspended')}
                      className="w-full py-1.5 text-xs font-semibold bg-amber-500/10 text-amber-600 rounded hover:bg-amber-500/20"
                    >
                      Suspendre le compte
                    </button>
                    <button
                      onClick={() => handleStatusChange('banned')}
                      className="w-full py-1.5 text-xs font-semibold bg-red-500/10 text-red-600 rounded hover:bg-red-500/20"
                    >
                      Bannir définitivement
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleStatusChange('active')}
                    className="w-full py-1.5 text-xs font-semibold bg-green-500/10 text-green-600 rounded hover:bg-green-500/20"
                  >
                    Réactiver le compte
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 border-b pb-2">
              <FileText className="h-4 w-4 text-primary" />
              Documents d'Identité
            </h3>
            <div className="space-y-4">
              {isEditing ? (
                <>
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
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Numéro de CNI</p>
                    <p className="text-sm font-medium text-foreground">{cniNumber || 'Non renseigné'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Photo de CNI</p>
                    {cniPhotoUrl ? (
                      <div className="aspect-[4/3] rounded-lg border border-border overflow-hidden bg-muted/20">
                        <img src={cniPhotoUrl} alt="CNI" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Aucune image chargée.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right columns: Form / Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/20">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Shield className="h-4.5 w-4.5 text-primary" />
                Détails de l'Utilisateur
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nom Complet *</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full border rounded-md p-2 bg-background text-sm"
                    />
                  ) : (
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Adresse Email *</label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border rounded-md p-2 bg-background text-sm"
                    />
                  ) : (
                    <p className="text-sm font-medium text-foreground">{user.email}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Rôle *</label>
                  {isEditing ? (
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="w-full border rounded-md p-2 bg-background text-sm"
                    >
                      <option value="agent">Agent de Terrain</option>
                      <option value="supervisor">Superviseur Régional</option>
                      <option value="admin">Administrateur Système</option>
                    </select>
                  ) : (
                    <p className="text-sm font-medium text-foreground capitalize">{user.role}</p>
                  )}
                </div>

                <div className="space-y-1 md:col-span-2 border-t pt-4">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    Zones Assignées (Multi-sélection)
                  </label>

                  {isEditing && (
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/10 mt-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold">Région</label>
                          <select
                            value={selectedReg || ''}
                            onChange={(e) => {
                              setSelectedReg(e.target.value ? parseInt(e.target.value, 10) : null);
                              setSelectedDept(null);
                              setSelectedArr(null);
                            }}
                            className="w-full border rounded-md p-2 bg-background text-xs"
                          >
                            <option value="">Sélectionnez...</option>
                            {regions?.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold">Département</label>
                          <select
                            disabled={!selectedReg}
                            value={selectedDept || ''}
                            onChange={(e) => {
                              setSelectedDept(e.target.value ? parseInt(e.target.value, 10) : null);
                              setSelectedArr(null);
                            }}
                            className="w-full border rounded-md p-2 bg-background text-xs disabled:opacity-50"
                          >
                            <option value="">Tous les départements</option>
                            {departments?.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold">Arrondissement</label>
                          <select
                            disabled={!selectedDept}
                            value={selectedArr || ''}
                            onChange={(e) => setSelectedArr(e.target.value ? parseInt(e.target.value, 10) : null)}
                            className="w-full border rounded-md p-2 bg-background text-xs disabled:opacity-50"
                          >
                            <option value="">Tous les arrondissements</option>
                            {arrondissements?.map(a => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddZone}
                        className="px-4 py-2 bg-secondary text-secondary-foreground font-semibold rounded text-xs flex items-center gap-1.5 hover:bg-secondary/90 transition-colors"
                      >
                        <Plus className="h-4 w-4" /> Assigner zone
                      </button>
                    </div>
                  )}

                  {/* Zones list */}
                  <div className="space-y-2 mt-3">
                    {assignedZones.length > 0 ? (
                      assignedZones.map((z, idx) => {
                        const parts = [z.regionName];
                        if (z.departmentName) parts.push(z.departmentName);
                        if (z.arrondissementName) parts.push(z.arrondissementName);
                        return (
                          <div key={idx} className="flex justify-between items-center bg-muted/40 p-2.5 rounded border text-xs">
                            <span className="font-medium text-foreground">{parts.join(' > ')}</span>
                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => handleRemoveZone(idx)}
                                className="text-red-500 hover:text-red-700 font-bold"
                              >
                                Retirer
                              </button>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Aucune zone assignée (Accès National par défaut).</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete User Modal confirmation */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full p-6 text-center space-y-4 animate-in fade-in">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Supprimer l'Utilisateur ?</h3>
            <p className="text-sm text-muted-foreground">
              Êtes-vous certain de vouloir supprimer définitivement cet utilisateur de la base de données ? Cette action est irréversible.
            </p>
            <div className="flex gap-3 pt-2 justify-center">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-input bg-background font-semibold rounded-md hover:bg-muted text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteUserMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 text-sm disabled:opacity-50"
              >
                {deleteUserMutation.isPending ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
