import React, { useState } from 'react';
import {
  useCreateUser,
  useListRegions,
  useListDepartments,
  useListArrondissements,
  useUploadFile
} from '@workspace/api-client-react';
import { useLocation, Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Trash2, Shield, User, Camera, Mail } from 'lucide-react';
import { useAuthContext } from '@/lib/auth';

export default function AddAgent() {
  const { isAdmin } = useAuthContext();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  if (!isAdmin) {
    setLocation('/dashboard');
    return null;
  }

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'agent' | 'supervisor' | 'admin'>('agent');
  const [cniNumber, setCniNumber] = useState('');
  const [cniPhotoUrl, setCniPhotoUrl] = useState('');

  // Zone Selection States
  const [selectedReg, setSelectedReg] = useState<number | null>(null);
  const [selectedDept, setSelectedDept] = useState<number | null>(null);
  const [selectedArr, setSelectedArr] = useState<number | null>(null);
  const [assignedZones, setAssignedZones] = useState<Array<{ regionId: number; departmentId?: number | null; arrondissementId?: number | null; regionName?: string; departmentName?: string; arrondissementName?: string }>>([]);

  const { data: regions } = useListRegions();
  const { data: departments } = useListDepartments(
    { regionId: selectedReg || undefined },
    { query: { enabled: !!selectedReg, queryKey: ['departments', selectedReg] } }
  );
  const { data: arrondissements } = useListArrondissements(
    { departmentId: selectedDept || undefined },
    { query: { enabled: !!selectedDept, queryKey: ['arrondissements', selectedDept] } }
  );

  const uploadFile = useUploadFile();
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      try {
        const res = await uploadFile.mutateAsync({
          data: {
            fileName: file.name,
            mimeType: file.type,
            base64Data: base64Data.split(',')[1],
          }
        });
        setCniPhotoUrl(res.url);
        toast({ title: 'Succès', description: 'Photo CNI téléversée.' });
      } catch (err) {
        toast({ variant: 'destructive', title: 'Erreur', description: 'Échec du téléversement.' });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddZone = () => {
    if (!selectedReg) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Veuillez sélectionner au moins une région.' });
      return;
    }

    const regObj = regions?.find(r => r.id === selectedReg);
    const deptObj = departments?.find(d => d.id === selectedDept);
    const arrObj = arrondissements?.find(a => a.id === selectedArr);

    // Prevent duplicate zone addition
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

    // reset picks
    setSelectedReg(null);
    setSelectedDept(null);
    setSelectedArr(null);
  };

  const createUser = useCreateUser();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !role) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Veuillez remplir les champs obligatoires.' });
      return;
    }

    try {
      await createUser.mutateAsync({
        data: {
          name,
          email,
          role,
          cniNumber: cniNumber || null,
          cniPhotoUrl: cniPhotoUrl || null,
          assignedZones: assignedZones.map(z => ({
            regionId: z.regionId,
            departmentId: z.departmentId || null,
            arrondissementId: z.arrondissementId || null,
          })),
        }
      });

      toast({
        title: 'Agent ajouté et invité !',
        description: 'Un lien d\'invitation Clerk sera envoyé par email à l\'adresse indiquée.'
      });
      setLocation('/users');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: err?.response?.data?.error || 'Impossible d\'ajouter l\'utilisateur.'
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <Link href="/users" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors font-medium">
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la liste
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Ajouter un Agent / Personnel</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Nom complet *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Jean Paul"
              className="w-full border rounded-md p-2 bg-background text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: jean.paul@gmail.com"
              className="w-full border rounded-md p-2 bg-background text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Rôle *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full border rounded-md p-2 bg-background text-sm"
            >
              <option value="agent">Agent de terrain</option>
              <option value="supervisor">Superviseur</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Numéro de CNI</label>
            <input
              type="text"
              value={cniNumber}
              onChange={(e) => setCniNumber(e.target.value)}
              placeholder="Numéro d'identité"
              className="w-full border rounded-md p-2 bg-background text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Photo de la CNI de l'agent</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors w-1/2">
                <Camera className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium">Téléverser la photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              {cniPhotoUrl && (
                <div className="h-16 w-24 rounded border overflow-hidden">
                  <img src={cniPhotoUrl} alt="CNI Agent" className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assigned Zones Selection Picker (Multi-Zone Assignment) */}
        <div className="border-t pt-4 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Zones assignées de recensement (Multi-sélection)</h3>
            <p className="text-xs text-muted-foreground">Sélectionnez les régions, départements ou arrondissements assignés à cet agent.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Région</label>
              <select
                value={selectedReg || ''}
                onChange={(e) => {
                  setSelectedReg(e.target.value ? parseInt(e.target.value, 10) : null);
                  setSelectedDept(null);
                  setSelectedArr(null);
                }}
                className="w-full border rounded p-1.5 text-xs bg-background"
              >
                <option value="">Sélectionner</option>
                {regions?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Département</label>
              <select
                value={selectedDept || ''}
                disabled={!selectedReg}
                onChange={(e) => {
                  setSelectedDept(e.target.value ? parseInt(e.target.value, 10) : null);
                  setSelectedArr(null);
                }}
                className="w-full border rounded p-1.5 text-xs bg-background"
              >
                <option value="">Tous</option>
                {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Arrondissement</label>
              <select
                value={selectedArr || ''}
                disabled={!selectedDept}
                onChange={(e) => setSelectedArr(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-full border rounded p-1.5 text-xs bg-background"
              >
                <option value="">Tous</option>
                {arrondissements?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddZone}
              className="bg-secondary text-secondary-foreground font-semibold px-4 py-2 text-xs rounded hover:bg-secondary/90 flex items-center justify-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Assigner zone
            </button>
          </div>

          {assignedZones.length > 0 && (
            <div className="border rounded-lg divide-y bg-muted/10">
              {assignedZones.map((z, idx) => (
                <div key={idx} className="p-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-primary">Région:</span> {z.regionName}{' '}
                    {z.departmentName && <><span className="font-bold ml-2">Département:</span> {z.departmentName}</>}{' '}
                    {z.arrondissementName && <><span className="font-bold ml-2">Arrondissement:</span> {z.arrondissementName}</>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAssignedZones(assignedZones.filter((_, i) => i !== idx))}
                    className="text-destructive hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Retirer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deviation / Custom copy requirement (Clerk Invitations instead of simple passwords) */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-4 flex gap-3 text-xs text-blue-900 dark:text-blue-200">
          <Mail className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Note d'inscription :</span> Conformément au système d'authentification Clerk, aucun mot de passe temporaire ne sera généré manuellement. <span className="font-semibold">Un lien d'invitation sécurisé sera automatiquement envoyé par email</span> à l'agent afin qu'il configure son mot de passe directement via Clerk.
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link
            href="/users"
            className="border border-input bg-background hover:bg-muted font-semibold px-4 py-2 rounded-md text-sm"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={createUser.isPending}
            className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 text-sm disabled:opacity-50"
          >
            {createUser.isPending ? 'Enregistrement...' : 'Ajouter et Inviter l\'agent'}
          </button>
        </div>
      </form>
    </div>
  );
}
