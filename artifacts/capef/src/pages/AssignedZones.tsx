import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft, MapPin, Shield, WifiOff, CheckCircle, Info } from 'lucide-react';
import { useAuthContext } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import {
  useOfflineFallbackRegions,
  useOfflineFallbackDepartments,
  useOfflineFallbackArrondissements,
} from '@/lib/offline-hooks';

export default function AssignedZones() {
  const { t } = useTranslation();
  const { user, isLoading, verificationStatus } = useAuthContext();
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  const regionsQuery = useOfflineFallbackRegions();
  const departmentsQuery = useOfflineFallbackDepartments();
  const arrondissementsQuery = useOfflineFallbackArrondissements();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-12 animate-pulse p-8">
        <div className="h-8 w-48 bg-muted rounded"></div>
        <div className="h-64 bg-card rounded-xl border border-border"></div>
      </div>
    );
  }

  const assignedZones = user?.assignedZones || [];

  const regMap = new Map(regionsQuery.data?.map(r => [r.id, r.name]) || []);
  const deptMap = new Map(departmentsQuery.data?.map(d => [d.id, d.name]) || []);
  const arrMap = new Map(arrondissementsQuery.data?.map(a => [a.id, a.name]) || []);

  const getRoleLabel = (role?: string) => {
    if (role === 'admin') return t('users.roles.admin', 'Administrateur');
    if (role === 'supervisor') return t('users.roles.supervisor', 'Superviseur');
    return t('users.roles.agent', 'Agent de terrain');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      {/* Header with Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> {t('profile.back_to_profile', 'Retour au profil')}
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            {t('profile.assigned_zones_title', 'Mes zones assignées')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('profile.assigned_zones_subtitle', 'Détail des périmètres géographiques d\'intervention assignés à votre compte.')}
          </p>
        </div>

        {/* Offline Saved Indicator Badge */}
        {isOffline && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0">
            <WifiOff className="h-3.5 w-3.5" />
            {t('profile.offline_saved_badge', 'Données sauvegardées hors ligne')}
          </div>
        )}
      </div>

      {/* User Scope Summary Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-bold text-foreground">{user?.name}</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Shield className="h-3.5 w-3.5 text-primary" /> {getRoleLabel(user?.role)}
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right border-t sm:border-t-0 border-border pt-3 sm:pt-0">
          <p className="text-xs text-muted-foreground">{t('profile.total_combinations', 'Total combinaisons')}</p>
          <p className="text-xl font-bold text-foreground">
            {assignedZones.length > 0
              ? `${assignedZones.length} ${t('users.combinations', 'combinaison(s)')}`
              : t('profile.national_regions', 'Toutes les régions (National)')}
          </p>
        </div>
      </div>

      {/* First-use offline notice if no user or empty cached profile */}
      {isOffline && !user && (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
          <Info className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="font-bold text-foreground">{t('profile.offline_first_use_title', 'Connexion requise')}</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t('profile.offline_first_use_desc', 'Veuillez vous connecter une fois à Internet pour charger et enregistrer vos zones assignées en local.')}
          </p>
        </div>
      )}

      {/* List of Assigned Zones */}
      {assignedZones.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {t('profile.zones_list_header', 'Combinaisons de zones ({{count}})', { count: assignedZones.length })}
          </h3>

          <div className="grid grid-cols-1 gap-4">
            {assignedZones.map((zone, idx) => {
              const regName = zone.regionId ? regMap.get(zone.regionId) || `${t('members.region', 'Région')} ID ${zone.regionId}` : t('profile.all_regions', 'Toutes les régions');
              const deptName = zone.departmentId ? deptMap.get(zone.departmentId) || `${t('members.department', 'Département')} ID ${zone.departmentId}` : t('users.all_departments', 'Tous les départements');
              const arrName = zone.arrondissementId ? arrMap.get(zone.arrondissementId) || `${t('members.arrondissement', 'Arrondissement')} ID ${zone.arrondissementId}` : t('users.all_arrondissements', 'Tous les arrondissements');

              return (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4" />
                      {t('profile.zone_number', 'Zone #{{num}}', { num: idx + 1 })}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      [R:{zone.regionId || '*'}/D:{zone.departmentId || '*'}/A:{zone.arrondissementId || '*'}]
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">{t('members.filters.region', 'Région')}</p>
                      <p className="font-bold text-foreground mt-0.5">{regName}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">{t('members.filters.department', 'Département')}</p>
                      <p className="font-medium text-foreground mt-0.5">{deptName}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">{t('members.filters.arrondissement', 'Arrondissement')}</p>
                      <p className="font-medium text-foreground mt-0.5">{arrName}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Empty State */
        user && (
          <div className="rounded-xl border border-border bg-card p-12 text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground mx-auto">
              <MapPin className="h-8 w-8 opacity-60" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {user.role === 'admin'
                  ? t('profile.national_scope_title', 'Accès National Intégral')
                  : t('profile.no_specific_zones_title', 'Aucune zone spécifique assignée')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                {user.role === 'admin'
                  ? t('profile.admin_national_desc', 'En tant qu\'administrateur national, votre compte est habilité sur l\'ensemble du territoire camerounais.')
                  : t('profile.no_zones_desc', 'Vous n\'avez pas de combinaisons restreintes. Votre compte couvre votre région administrative assignée ou le territoire national.')}
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
