import React from 'react';
import { useGetMember, useGenerateBadge } from '@workspace/api-client-react';
import { useRoute, Link } from 'wouter';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  ArrowLeft, Edit, FileBadge, MapPin, Phone, Mail, Building, User, Tag
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function MemberDetail() {
  const [, params] = useRoute('/members/:id');
  const id = Number(params?.id);
  const { toast } = useToast();

  const { data: member, isLoading, error } = useGetMember(id, {
    query: { enabled: !!id, queryKey: ['member', id] }
  });

  const generateBadge = useGenerateBadge();

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

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <Link href="/members" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors font-medium">
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la liste
        </Link>
        <div className="flex gap-3">
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
        <div className="h-24 w-24 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mx-auto md:mx-0">
          {isPhysique ? <User className="h-10 w-10" /> : <Building className="h-10 w-10" />}
        </div>
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">
              {isPhysique ? `${(info as any)?.nom} ${(info as any)?.prenom || ''}` : (info as any)?.nom}
            </h1>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getCategoryColor(member.category)} capitalize self-center md:self-auto`}>
              {member.category}
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
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">N° CNI</dt><dd className="col-span-2 font-medium">{(info as any)?.numeroCni || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Lieu de rés.</dt><dd className="col-span-2 font-medium">{(info as any)?.lieuResidence || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4"><dt className="text-muted-foreground font-medium">Niveau d'études</dt><dd className="col-span-2 font-medium">{(info as any)?.niveauEtudes || '-'}</dd></div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Type</dt><dd className="col-span-2 font-medium">{(info as any)?.typeOrganisation || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">N° Immat.</dt><dd className="col-span-2 font-medium">{(info as any)?.numeroImmatriculation || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Site Web</dt><dd className="col-span-2 font-medium">{(info as any)?.website || '-'}</dd></div>
                  <div className="grid grid-cols-3 gap-4"><dt className="text-muted-foreground font-medium">Nbr. Membres</dt><dd className="col-span-2 font-medium">{(info as any)?.nombreMembres || '-'}</dd></div>
                </>
              )}
            </dl>
          </div>
        </div>

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

        {/* Metadata Box */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold flex items-center gap-2 text-foreground">
              <Tag className="h-5 w-5 text-primary" />
              Détails de l'Enrôlement
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <dl className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-4 border-b border-border/50 pb-2"><dt className="text-muted-foreground font-medium">Enregistré le</dt><dd className="col-span-2 font-medium">{format(new Date(member.createdAt), 'dd MMMM yyyy HH:mm', { locale: fr })}</dd></div>
              <div className="grid grid-cols-3 gap-4"><dt className="text-muted-foreground font-medium">Agent</dt><dd className="col-span-2 font-medium">{member.createdByName || '-'}</dd></div>
            </dl>
            <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
              <h4 className="font-semibold mb-2 text-sm text-foreground">Données Spécifiques Catégorie</h4>
              {member.categoryData && Object.keys(member.categoryData).length > 0 ? (
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground font-mono bg-background p-2 rounded border border-border overflow-x-auto">
                  {JSON.stringify(member.categoryData, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune donnée spécifique renseignée.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
