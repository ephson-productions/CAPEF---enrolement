import React from 'react';
import { customFetch } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import {
  MapPin, Phone, Mail, Building, User, Tag, FileText, CheckCircle2, AlertOctagon, XCircle, Clock
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function BadgeVerify() {
  const { t } = useTranslation();
  const [, params] = useRoute('/badge-verify/:token');
  const token = params?.token ?? '';

  const { data: member, isLoading, error } = useQuery({
    queryKey: ['badge-member', token],
    queryFn: async () => {
      return customFetch<any>(`/api/members/badge/${token}`);
    },
    enabled: !!token,
    retry: false,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valide':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t('badge.status.validated', 'Enrôlement Validé')}
          </span>
        );
      case 'bloque':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <AlertOctagon className="h-3.5 w-3.5" /> {t('members.status.bloque', 'Bloqué')}
          </span>
        );
      case 'desactive':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">
            <XCircle className="h-3.5 w-3.5" /> {t('members.status.desactive', 'Désactivé')}
          </span>
        );
      case 'en_attente':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
            <Clock className="h-3.5 w-3.5" /> {t('badge.status.pending_validation', 'En Attente de Validation')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="h-3.5 w-3.5" /> {t('members.status.incomplet', 'Incomplet')}
          </span>
        );
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'agriculteur': return t('members.categories.agriculteur', 'Agriculteur');
      case 'pecheur': return t('members.categories.pecheur', 'Pêcheur / Aquaculteur');
      case 'eleveur': return t('members.categories.eleveur', 'Éleveur');
      case 'forestier': return t('members.categories.forestier', 'Exploitant Forestier');
      case 'artisan': return t('members.categories.artisan', 'Artisan');
      default: return cat;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground font-medium">{t('badge.verifying', 'Vérification de l\'enrôlement...')}</p>
        </div>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertOctagon className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t('badge.verify_failed_title', 'Échec de la Vérification')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('badge.verify_failed_desc', 'Le code scanné n\'est pas ou plus valide, ou ce membre n\'existe pas dans le registre de la CAPEF.')}
          </p>
          <div className="pt-2">
            <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">Token: {token}</p>
          </div>
        </div>
      </div>
    );
  }

  const isPhysique = member.memberType === 'physique';
  const info = isPhysique ? member.physiqueData : member.moraleData;
  const regionName = member.regionName ?? '-';

  return (
    <div className="min-h-screen bg-muted/30 text-foreground pb-12">
      {/* CAPEF Theme Header */}
      <header className="bg-primary text-primary-foreground py-6 px-4 shadow-md text-center space-y-1">
        <h1 className="text-lg font-bold tracking-wide uppercase">CAPEF Cameroun</h1>
        <p className="text-xs opacity-90">{t('badge.portal_subtitle', 'Portail Public de Vérification des Enrôlements')}</p>
      </header>

      <div className="max-w-md mx-auto px-4 mt-6 space-y-6">
        {/* Verification Status Card */}
        <div className="bg-card rounded-2xl border border-border shadow-md p-6 text-center space-y-3">
          <div className="text-center">{getStatusBadge(member.status)}</div>
          <h2 className="text-lg font-extrabold text-foreground">{member.displayName}</h2>
          <p className="text-xs text-muted-foreground font-mono bg-muted py-1.5 px-3 rounded inline-block">
            ID: {member.memberNumber}
          </p>
        </div>

        {/* Member Profile Details */}
        <div className="bg-card rounded-2xl border border-border shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold flex items-center gap-2 text-sm text-foreground">
              {isPhysique ? <User className="h-4.5 w-4.5 text-primary" /> : <Building className="h-4.5 w-4.5 text-primary" />}
              {isPhysique ? t('members.detail.personal_info', 'Informations Personnelles') : t('members.detail.org_info', 'Informations de l\'Organisation')}
            </h3>
          </div>
          <div className="p-6">
            <dl className="space-y-3.5 text-sm">
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <dt className="text-muted-foreground font-medium">Type</dt>
                <dd className="col-span-2 font-bold text-foreground">
                  {isPhysique ? t('members.types.physique', 'Personne Physique') : t('members.types.morale', 'Personne Morale')}
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <dt className="text-muted-foreground font-medium">{t('members.table.category', 'Catégorie')}</dt>
                <dd className="col-span-2 font-semibold text-primary">
                  {getCategoryLabel(member.category)}
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <dt className="text-muted-foreground font-medium">{t('members.filters.region', 'Région')}</dt>
                <dd className="col-span-2 font-medium">{regionName}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <dt className="text-muted-foreground font-medium">{t('members.filters.department', 'Département')}</dt>
                <dd className="col-span-2 font-medium">{member.departmentName || '-'}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <dt className="text-muted-foreground font-medium">{t('members.filters.arrondissement', 'Arrondissement')}</dt>
                <dd className="col-span-2 font-medium">{member.arrondissementName || '-'}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <dt className="text-muted-foreground font-medium">{t('members.detail.village', 'Village/Quartier')}</dt>
                <dd className="col-span-2 font-medium">{member.village || '-'}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2 pb-1">
                <dt className="text-muted-foreground font-medium">{t('members.detail.phone_primary', 'Téléphone')}</dt>
                <dd className="col-span-2 font-medium">
                  {isPhysique ? (info as any)?.telephone1 : (info as any)?.telephone1 || '-'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Member Productions Card */}
        {member.activities && member.activities.length > 0 && (
          <div className="bg-card rounded-2xl border border-border shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/20">
              <h3 className="font-bold flex items-center gap-2 text-sm text-foreground">
                <Tag className="h-4.5 w-4.5 text-primary" />
                {t('activities.title_simple', 'Activités & Productions')}
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {member.activities.map((act: any) => (
                <div key={act.id} className="space-y-3 last:border-b-0 pb-4 last:pb-0 border-b border-border/40">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-foreground text-sm uppercase">
                      {getCategoryLabel(act.activityType)}
                    </h4>
                    {act.isPrimary && (
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                        {t('activities.primary_tag', 'Principale')}
                      </span>
                    )}
                  </div>
                  {act.lineItems && act.lineItems.length > 0 ? (
                    <div className="space-y-3">
                      {act.lineItems.map((item: any) => (
                        <div key={item.id} className="bg-muted/30 border border-border/40 rounded-xl p-3 text-xs space-y-2">
                          {act.activityType === 'agriculteur' && (
                            <>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.crop_label', 'Culture :')}</span><span className="font-bold">{item.cropName || '-'} ({item.cropCategory || '-'})</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Type :</span><span>{item.cultureType || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.superficie_short', 'Superficie :')}</span><span>{item.superficieHa ? `${item.superficieHa} Ha` : '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.production_short', 'Production :')}</span><span>{item.productionQuantity ? `${item.productionQuantity} ${item.productionUnit || ''}` : '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.value_short', 'Valeur :')}</span><span className="font-semibold text-primary">{item.productionFcfa ? `${item.productionFcfa.toLocaleString()} FCFA` : '-'}</span></div>
                            </>
                          )}
                          {act.activityType === 'pecheur' && (
                            <>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.species_label', 'Espèce :')}</span><span className="font-bold">{item.speciesPêche || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.production_short', 'Production :')}</span><span>{item.productionQuantity ? `${item.productionQuantity} ${item.productionUnit || ''}` : '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.value_short', 'Valeur :')}</span><span className="font-semibold text-primary">{item.productionFcfa ? `${item.productionFcfa.toLocaleString()} FCFA` : '-'}</span></div>
                            </>
                          )}
                          {act.activityType === 'eleveur' && (
                            <>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.species_label', 'Espèce :')}</span><span className="font-bold">{item.species || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.cheptel_short', 'Taille cheptel :')}</span><span>{item.cheptelSize || '-'} {t('activities.heads', 'têtes')}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.food_short', 'Nourriture :')}</span><span>{item.foodType || '-'}</span></div>
                            </>
                          )}
                          {act.activityType === 'forestier' && (
                            <>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.essence_label', 'Essence :')}</span><span className="font-bold">{item.essence || '-'} ({item.subCategory || '-'})</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.plantation_type_short', 'Type plantation :')}</span><span>{item.plantationType || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.superficie_short', 'Superficie :')}</span><span>{item.superficieHa ? `${item.superficieHa} Ha` : '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.production_short', 'Production :')}</span><span>{item.productionQuantity ? `${item.productionQuantity} ${item.productionUnit || ''}` : '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.value_short', 'Valeur :')}</span><span className="font-semibold text-primary">{item.productionFcfa ? `${item.productionFcfa.toLocaleString()} FCFA` : '-'}</span></div>
                            </>
                          )}
                          {act.activityType === 'artisan' && (
                            <>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.product_label', 'Produit :')}</span><span className="font-bold">{item.artisanatProducts || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.raw_mat_short', 'Matières Prem. :')}</span><span>{item.rawMaterials || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.production_short', 'Production :')}</span><span>{item.productionQuantity ? `${item.productionQuantity} ${item.productionUnit || ''}` : '-'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{t('activities.value_short', 'Valeur :')}</span><span className="font-semibold text-primary">{item.productionFcfa ? `${item.productionFcfa.toLocaleString()} FCFA` : '-'}</span></div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">{t('activities.no_line_items_simple', 'Aucune ligne de production saisie.')}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="text-center text-[10px] text-muted-foreground space-y-1">
          <p>© {new Date().getFullYear()} CAPEF Cameroun. {t('common.all_rights_reserved', 'Tous droits réservés.')}</p>
          <p>{t('badge.official_certification', 'Données officielles certifiées conformes par la Chambre d\'Agriculture.')}</p>
        </div>
      </div>
    </div>
  );
}
