import React, { useState, useMemo } from 'react';
import {
  useGetMember,
  useGenerateBadge,
  useValidateMember,
  useDeactivateMember,
  useReactivateMember,
  useBlockMember,
  useListRegions,
  useListDepartments,
  useListArrondissements
} from '@workspace/api-client-react';
import { useRoute, Link } from 'wouter';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft, Edit, FileBadge, MapPin, Phone, Mail, Building, User, Tag, FileText, CheckSquare, Plus,
  CheckCircle, XCircle, RotateCcw, AlertOctagon
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthContext } from '@/lib/auth';
import ActivityWizard from '@/components/members/ActivityWizard';

export default function MemberDetail() {
  const [, params] = useRoute('/members/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const { isAdmin } = useAuthContext();

  const { data: member, isLoading, error, refetch: refetchMember } = useGetMember(id, {
    query: { enabled: !!id, queryKey: ['member', id] }
  });

  // Reference tables for resolving raw location IDs for representatives
  const isPhysiqueMember = member?.memberType === 'physique';
  const hasReps = !isPhysiqueMember && (member?.moraleData as any)?.representants?.length > 0;

  const regionsQuery = useListRegions({
    query: { enabled: hasReps, queryKey: ['regions'] }
  });
  const departmentsQuery = useListDepartments(
    {}, // all departments
    { query: { enabled: hasReps, queryKey: ['departments-all'] } }
  );
  const arrondissementsQuery = useListArrondissements(
    {}, // all arrondissements
    { query: { enabled: hasReps, queryKey: ['arrondissements-all'] } }
  );

  const regionNameById = useMemo(() => {
    const map: Record<number, string> = {};
    regionsQuery.data?.forEach(r => { map[r.id] = r.name; });
    return map;
  }, [regionsQuery.data]);

  const departmentNameById = useMemo(() => {
    const map: Record<number, string> = {};
    departmentsQuery.data?.forEach(d => { map[d.id] = d.name; });
    return map;
  }, [departmentsQuery.data]);

  const arrondissementNameById = useMemo(() => {
    const map: Record<number, string> = {};
    arrondissementsQuery.data?.forEach(a => { map[a.id] = a.name; });
    return map;
  }, [arrondissementsQuery.data]);

  const generateBadge = useGenerateBadge();
  const [showWizard, setShowWizard] = useState(false);

  // Status transitions
  const validateMutation = useValidateMember();
  const deactivateMutation = useDeactivateMember();
  const reactivateMutation = useReactivateMember();
  const blockMutation = useBlockMember();

  const handleStatusAction = async (action: 'validate' | 'deactivate' | 'reactivate' | 'block') => {
    try {
      if (action === 'validate') {
        await validateMutation.mutateAsync({ id });
        toast({ title: 'Succès', description: 'Membre validé.' });
      } else if (action === 'deactivate') {
        await deactivateMutation.mutateAsync({ id });
        toast({ title: 'Succès', description: 'Membre désactivé.' });
      } else if (action === 'reactivate') {
        await reactivateMutation.mutateAsync({ id });
        toast({ title: 'Succès', description: 'Membre réactivé.' });
      } else if (action === 'block') {
        if (confirm('Êtes-vous sûr de vouloir bloquer ce membre définitivement ? Cette action est irréversible.')) {
          await blockMutation.mutateAsync({ id });
          toast({ title: 'Succès', description: 'Membre bloqué définitivement.' });
        }
      }
      refetchMember();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err?.response?.data?.error || 'Une erreur est survenue.' });
    }
  };

  const handleGenerateBadge = async () => {
    try {
      const result = await generateBadge.mutateAsync({ id });
      if (result.badgeUrl) {
        window.open(result.badgeUrl, '_blank');
        toast({ title: 'Badge généré', description: 'Le badge a été ouvert dans un nouvel onglet.' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de générer le badge.' });
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Chargement des détails...</div>;
  }

  if (error || !member) {
    return <div className="p-8 text-center text-destructive font-bold">Membre introuvable.</div>;
  }

  if (showWizard) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setShowWizard(false);
            refetchMember();
          }}
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors font-medium mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour au profil
        </button>
        <ActivityWizard memberId={id} onComplete={() => {
          setShowWizard(false);
          refetchMember();
        }} />
      </div>
    );
  }

  const isPhysique = member.memberType === 'physique';
  const info = isPhysique ? member.physiqueData : member.moraleData;

  const getCategoryColor = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'agriculteur': return 'bg-green-100 text-green-800 border-green-200';
      case 'pecheur': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'eleveur': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'forestier': return 'bg-amber-100 text-amber-900 border-amber-200';
      case 'artisan': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'incomplet': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'en_attente': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'valide': return 'bg-green-100 text-green-800 border-green-200';
      case 'desactive': return 'bg-red-100 text-red-800 border-red-200';
      case 'bloque': return 'bg-red-200 text-red-900 border-red-300 font-bold';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header Actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Link href="/members" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors font-medium">
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la liste
        </Link>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <div className="flex gap-1.5 border-r border-border pr-3 mr-1 flex-wrap">
              {member.status === 'en_attente' && (
                <button
                  onClick={() => handleStatusAction('validate')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 transition-colors"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Valider
                </button>
              )}
              {member.status === 'valide' && (
                <button
                  onClick={() => handleStatusAction('deactivate')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 text-white text-xs font-semibold rounded hover:bg-yellow-700 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" /> Désactiver
                </button>
              )}
              {member.status === 'desactive' && (
                <button
                  onClick={() => handleStatusAction('reactivate')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Réactiver
                </button>
              )}
              {member.status !== 'bloque' && (
                <button
                  onClick={() => handleStatusAction('block')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 transition-colors"
                >
                  <AlertOctagon className="h-3.5 w-3.5" /> Bloquer
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground font-semibold rounded-md shadow-sm hover:bg-secondary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Saisir Activité (Wizard)
          </button>
          <button
            onClick={handleGenerateBadge}
            disabled={generateBadge.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground font-semibold rounded-md shadow-sm hover:bg-secondary/90 transition-colors disabled:opacity-50"
          >
            <FileBadge className="h-4 w-4" />
            {generateBadge.isPending ? 'Génération...' : 'Générer Badge'}
          </button>
          <Link
            href={`/members/${member.id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary font-semibold rounded-md hover:bg-primary/20 transition-colors"
          >
            <Edit className="h-4 w-4" /> Modifier
          </Link>
        </div>
      </div>

      {/* Main Profile Header */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center">
        <div className="h-24 w-24 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mx-auto md:mx-0 overflow-hidden border border-border">
          {isPhysique && (info as any)?.photoUrl ? (
            <img src={(info as any).photoUrl} alt="Membre" className="h-full w-full object-cover" />
          ) : isPhysique ? (
            <User className="h-10 w-10" />
          ) : (
            <Building className="h-10 w-10" />
          )}
        </div>
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2 flex-wrap justify-center md:justify-start">
            <h1 className="text-3xl font-bold text-foreground">
              {isPhysique ? `${(info as any)?.nom} ${(info as any)?.prenom || ''}` : (info as any)?.nom}
            </h1>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getCategoryColor(member.category)} capitalize self-center md:self-auto`}>
              {member.category}
            </span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getStatusBadgeColor(member.status)} capitalize self-center md:self-auto`}>
              Statut: {member.status}
            </span>
          </div>
          <p className="text-muted-foreground font-mono text-lg mb-4">{member.memberNumber}</p>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {member.regionName || 'Région non définie'}</div>
            {isPhysique && (info as any)?.telephone1 && <div className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {(info as any).telephone1}</div>}
            {isPhysique && (info as any)?.email && <div className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> {(info as any).email}</div>}
            {!isPhysique && (info as any)?.telephone1 && <div className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {(info as any).telephone1}</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Multi-Activities Section */}
        {member.activities && member.activities.length > 0 && (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden md:col-span-2">
            <div className="px-6 py-4 border-b border-border bg-muted/20">
              <h3 className="font-bold flex items-center gap-2 text-foreground">
                <CheckSquare className="h-5 w-5 text-primary" />
                Activités & Productions ({member.activities.length})
              </h3>
            </div>
            <div className="p-6 space-y-6 divide-y divide-border">
              {member.activities.map((act) => (
                <div key={act.id} className="pt-4 first:pt-0 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold capitalize text-primary text-base">
                      {act.activityType} {act.isPrimary && <span className="text-xs bg-yellow-500/10 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded-full ml-1">Principale</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">Saisie le {format(new Date(act.createdAt || ''), 'dd/MM/yyyy')}</span>
                  </div>

                  {act.maillons && act.maillons.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {act.maillons.map(m => (
                        <span key={m} className="text-[11px] font-medium border bg-muted px-2 py-0.5 rounded-full">{m}</span>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted text-muted-foreground font-semibold">
                        <tr>
                          <th className="p-2">Détails</th>
                          <th className="p-2">Spécificités</th>
                          <th className="p-2">Production (Qté / Unité)</th>
                          <th className="p-2 text-right">Valeur (FCFA)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {act.lineItems?.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-muted-foreground">Aucune ligne d'activité.</td>
                          </tr>
                        ) : (
                          act.lineItems?.map(item => (
                            <tr key={item.id} className="hover:bg-muted/10">
                              <td className="p-2 font-medium">
                                {act.activityType === 'agriculteur' && `${item.cropCategory || ''} - ${item.cropName || ''}`}
                                {act.activityType === 'pecheur' && item.speciesPêche}
                                {act.activityType === 'eleveur' && item.species}
                                {act.activityType === 'forestier' && `${item.subCategory || ''} - ${item.essence || ''}`}
                                {act.activityType === 'artisan' && item.artisanatProducts}
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {act.activityType === 'agriculteur' && `Type: ${item.cultureType || ''}, Superficie: ${item.superficieHa || 'N/A'} ha`}
                                {act.activityType === 'eleveur' && `Cheptel: ${item.cheptelSize || 'N/A'}, Nourriture: ${item.foodType || 'N/A'}`}
                                {act.activityType === 'forestier' && `Plantation: ${item.plantationType || 'N/A'}, Superficie: ${item.superficieHa || 'N/A'} ha`}
                                {act.activityType === 'artisan' && `Matières: ${item.rawMaterials || ''}`}
                              </td>
                              <td className="p-2">
                                {item.productionQuantity || 'N/A'} {item.productionUnit || ''}
                              </td>
                              <td className="p-2 text-right font-mono font-medium">{item.productionFcfa?.toLocaleString() || '0'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold flex items-center gap-2 text-foreground">
              {isPhysique ? <User className="h-5 w-5 text-primary" /> : <Building className="h-5 w-5 text-primary" />}
              Informations {isPhysique ? 'Personnelles' : 'de l\'Organisation'}
            </h3>
          </div>
          <div className="p-6">
            <dl className="space-y-4 text-sm">
              {isPhysique ? (
                <>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Civilité</dt><dd className="col-span-2 font-medium">{(info as any)?.civilite || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Sexe</dt><dd className="col-span-2 font-medium">{(info as any)?.sexe === 'M' ? 'Masculin' : (info as any)?.sexe === 'F' ? 'Féminin' : '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Sit. Matrimoniale</dt><dd className="col-span-2 font-medium">{(info as any)?.situationMatrimoniale || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Date de naiss.</dt><dd className="col-span-2 font-medium">{(info as any)?.dateNaissance || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Lieu de naiss.</dt><dd className="col-span-2 font-medium">{(info as any)?.lieuNaissance || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">N° CNI</dt><dd className="col-span-2 font-medium">{(info as any)?.numeroCni || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Lieu de rés.</dt><dd className="col-span-2 font-medium">{(info as any)?.lieuResidence || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Niveau d'études</dt><dd className="col-span-2 font-medium">{(info as any)?.niveauEtudes || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Tél. Principal (WhatsApp)</dt><dd className="col-span-2 font-medium">{(info as any)?.telephone1 || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Tél. Secondaire</dt><dd className="col-span-2 font-medium">{(info as any)?.telephone2 || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Email</dt><dd className="col-span-2 font-medium">{(info as any)?.email || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Tél. Personne à contacter</dt><dd className="col-span-2 font-medium">{(info as any)?.telephonePersonneAContacter || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4"><dt className="text-muted-foreground font-medium">BP</dt><dd className="col-span-2 font-medium">{(info as any)?.boitePostale || '-'}</dd></div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Type</dt><dd className="col-span-2 font-medium">{(info as any)?.typeOrganisation || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">N° Immat.</dt><dd className="col-span-2 font-medium">{(info as any)?.numeroImmatriculation || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Date Immat.</dt><dd className="col-span-2 font-medium">{(info as any)?.dateImmatriculation || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Tél. Principal</dt><dd className="col-span-2 font-medium">{(info as any)?.telephone1 || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Tél. Secondaire</dt><dd className="col-span-2 font-medium">{(info as any)?.telephone2 || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Email</dt><dd className="col-span-2 font-medium">{(info as any)?.email || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">BP</dt><dd className="col-span-2 font-medium">{(info as any)?.boitePostale || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Site Web</dt><dd className="col-span-2 font-medium">{(info as any)?.website || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Nbr. Membres</dt><dd className="col-span-2 font-medium">{(info as any)?.nombreMembres || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4"><dt className="text-muted-foreground font-medium">Nbr. Femmes</dt><dd className="col-span-2 font-medium">{(info as any)?.nombreFemmes ?? '-'}</dd></div>
                </>
              )}
            </dl>
          </div>
        </div>

        {/* Représentants de l'Organisation Card */}
        {!isPhysique && (member?.moraleData as any)?.representants?.length > 0 && (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/20">
              <h3 className="font-bold flex items-center gap-2 text-foreground">
                <User className="h-5 w-5 text-primary" />
                Représentants de l'Organisation
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {((member?.moraleData as any).representants as any[]).map((rep: any, idx: number) => (
                <div key={idx} className="border-b border-border/50 pb-6 last:border-0 last:pb-0">
                  <h4 className="font-bold text-foreground mb-3 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                    Représentant {rep.ordre || idx + 1} — {rep.civilite} {rep.nom} {rep.prenom}
                  </h4>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div><dt className="text-muted-foreground inline">Profession: </dt><dd className="inline font-medium">{rep.profession || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">Fonction: </dt><dd className="inline font-medium">{rep.fonction || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">Tél. 1: </dt><dd className="inline font-medium">{rep.telephone1 || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">Tél. 2: </dt><dd className="inline font-medium">{rep.telephone2 || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">Email: </dt><dd className="inline font-medium">{rep.email || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">BP: </dt><dd className="inline font-medium">{rep.boitePostale || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">Région: </dt><dd className="inline font-medium">{regionNameById[rep.regionId] || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">Département: </dt><dd className="inline font-medium">{departmentNameById[rep.departmentId] || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">Arrondissement: </dt><dd className="inline font-medium">{arrondissementNameById[rep.arrondissementId] || '-'}</dd></div>
                    <div><dt className="text-muted-foreground inline">Village/Quartier: </dt><dd className="inline font-medium">{rep.village || '-'}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-muted-foreground inline">Adresse détaillée: </dt><dd className="inline font-medium">{rep.adresseDetaillee || '-'}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Location Box */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold flex items-center gap-2 text-foreground">
              <MapPin className="h-5 w-5 text-primary" />
              Localisation
            </h3>
          </div>
          <div className="p-6">
            <dl className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Région</dt><dd className="col-span-2 font-medium">{member.regionName || '-'}</dd></div>
              <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Département</dt><dd className="col-span-2 font-medium">{member.departmentName || '-'}</dd></div>
              <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Arrondissement</dt><dd className="col-span-2 font-medium">{member.arrondissementName || '-'}</dd></div>
              <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Village/Quartier</dt><dd className="col-span-2 font-medium">{member.village || '-'}</dd></div>
              <div className="grid grid-cols-3 gap-4"><dt className="text-muted-foreground font-medium">GPS</dt><dd className="col-span-2 font-mono text-xs">{member.gpsLat ? `${member.gpsLat}, ${member.gpsLng}` : 'Non renseigné'}</dd></div>
            </dl>
          </div>
        </div>

        {/* Documents and Signatures Section (if Personne Physique) */}
        {isPhysique && (((info as any)?.cniRectoUrl || (info as any)?.cniVersoUrl || (info as any)?.signatureUrl) && (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden md:col-span-2">
            <div className="px-6 py-4 border-b border-border bg-muted/20">
              <h3 className="font-bold flex items-center gap-2 text-foreground">
                <FileText className="h-5 w-5 text-primary" />
                Documents & Signatures
              </h3>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {(info as any)?.cniRectoUrl && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">CNI Recto</h4>
                  <div className="aspect-[3/2] rounded-lg border border-border overflow-hidden bg-muted/20">
                    <img src={(info as any).cniRectoUrl} alt="CNI Recto" className="h-full w-full object-cover" />
                  </div>
                </div>
              )}
              {(info as any)?.cniVersoUrl && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">CNI Verso</h4>
                  <div className="aspect-[3/2] rounded-lg border border-border overflow-hidden bg-muted/20">
                    <img src={(info as any).cniVersoUrl} alt="CNI Verso" className="h-full w-full object-cover" />
                  </div>
                </div>
              )}
              {(info as any)?.signatureUrl && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Signature Tactile</h4>
                  <div className="aspect-[3/2] rounded-lg border border-border overflow-hidden bg-white flex items-center justify-center p-2">
                    <img src={(info as any).signatureUrl} alt="Signature" className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Documents Section (if Personne Morale / Certificate of conformity) */}
        {!isPhysique && (info as any)?.certificatUrl && (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden md:col-span-2">
            <div className="px-6 py-4 border-b border-border bg-muted/20">
              <h3 className="font-bold flex items-center gap-2 text-foreground">
                <FileText className="h-5 w-5 text-primary" />
                Certificat de Conformité
              </h3>
            </div>
            <div className="p-6">
              <div className="max-w-md space-y-2">
                <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Certificat</h4>
                <div className="aspect-[3/2] rounded-lg border border-border overflow-hidden bg-muted/20">
                  <img src={(info as any).certificatUrl} alt="Certificat de Conformité" className="h-full w-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Metadata Box */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold flex items-center gap-2 text-foreground">
              <Tag className="h-5 w-5 text-primary" />
              Détails de l'Enrôlement
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 gap-6">
            <dl className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Enregistré le</dt><dd className="col-span-2 font-medium">{format(new Date(member.createdAt || ''), 'dd MMMM yyyy HH:mm', { locale: fr })}</dd></div>
              <div className="grid grid-cols-3 gap-4"><dt className="text-muted-foreground font-medium">Agent</dt><dd className="col-span-2 font-medium">{member.createdByName || '-'}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
