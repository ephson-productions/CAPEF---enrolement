import React, { useState } from 'react';
import { useGetDashboardStats, useListRegions } from '@workspace/api-client-react';
import { Users, Building2, Trees, Droplets, Tractor, Hammer, ArrowRight, UserCheck } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { CATEGORY_STYLES } from '@/lib/category-colors';

export default function Dashboard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | undefined>('');
  const [activity, setActivity] = useState<string | undefined>('');
  const [regionId, setRegionId] = useState<number | undefined>(undefined);

  const { data: stats, isLoading } = useGetDashboardStats({
    status: status || undefined,
    activity: activity || undefined,
    regionId: regionId || undefined,
  }, {
    query: {
      queryKey: ['dashboard-stats', { status, activity, regionId }],
      placeholderData: (prev) => prev,
    }
  });

  const { data: regions } = useListRegions();

  if (isLoading || !stats) {
    return (
      <div className="space-y-6 animate-pulse p-4 lg:p-8">
        <div className="h-8 w-48 bg-muted rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-xl"></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-muted rounded-xl"></div>
          <div className="h-64 bg-muted rounded-xl"></div>
        </div>
      </div>
    );
  }

  const getCategoryIcon = (cat: string) => {
    const lower = cat.toLowerCase();
    const style = CATEGORY_STYLES[lower];
    const baseText = style?.baseText ?? "text-primary";
    const groupHoverText = style?.groupHoverText ?? "";
    const classes = `h-5 w-5 transition-[color,transform] duration-500 ease-out group-hover:-translate-y-0.5 group-focus:-translate-y-0.5 group-active:translate-y-0 ${baseText} ${groupHoverText}`;

    switch (lower) {
      case 'agriculteur': return <Tractor className={classes} />;
      case 'pecheur': return <Droplets className={classes} />;
      case 'eleveur': return <Building2 className={classes} />;
      case 'forestier': return <Trees className={classes} />;
      case 'artisan': return <Hammer className={classes} />;
      default: return <Users className={classes} />;
    }
  };

  const getStatusLabel = (statVal: string) => {
    switch (statVal) {
      case 'incomplet': return t('members.status.incomplete');
      case 'en_attente': return t('members.status.pending');
      case 'valide': return t('members.status.valid');
      case 'desactive': return t('members.status.deactivated');
      case 'bloque': return t('members.status.blocked');
      default: return statVal;
    }
  };

  const byCategory = stats?.byCategory || [];
  const byRegion = stats?.byRegion || [];
  const byStatus = stats?.byStatus || [];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('dashboard.subtitle')}</p>
        </div>

        <Link
          href="/members/new"
          className="inline-flex touch-manipulation items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg shadow transition-[background-color,transform,box-shadow] duration-500 ease-out hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm"
        >
          {t('navigation.new_enrollment')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Dashboard Filter Controls */}
      <div className="bg-card rounded-xl p-4 border border-border shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 transition-[box-shadow,border-color] duration-500 ease-out hover:shadow-md hover:border-primary/20">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {t('common.filter')} par {t('members.status.label')}
          </label>
          <select
            value={status || ''}
            onChange={(e) => setStatus(e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          >
            <option value="">{t('members.filters.all_statuses')}</option>
            <option value="incomplet">{t('members.status.incomplete')}</option>
            <option value="en_attente">{t('members.status.pending')}</option>
            <option value="valide">{t('members.status.valid')}</option>
            <option value="desactive">{t('members.status.deactivated')}</option>
            <option value="bloque">{t('members.status.blocked')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {t('common.filter')} par {t('activities.activity_type')}
          </label>
          <select
            value={activity || ''}
            onChange={(e) => setActivity(e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          >
            <option value="">{t('members.filters.all_categories')}</option>
            <option value="agriculteur">{t('members.categories.agriculture')}</option>
            <option value="pecheur">{t('members.categories.peche')}</option>
            <option value="eleveur">{t('members.categories.elevage')}</option>
            <option value="forestier">{t('members.categories.foret')}</option>
            <option value="artisan">{t('members.categories.artisanat')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {t('common.filter')} par {t('members.region')}
          </label>
          <select
            value={regionId || ''}
            onChange={(e) => setRegionId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          >
            <option value="">{t('members.filters.all_regions')}</option>
            {regions?.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div tabIndex={0} className="group bg-card rounded-xl p-6 border border-border shadow-sm flex flex-col justify-between transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1 focus:-translate-y-1 hover:shadow-md focus:shadow-md hover:border-primary/30 focus:border-primary/30 active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-muted-foreground text-sm">{t('dashboard.total_members')}</h3>
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center transition-transform duration-500 ease-out group-hover:-translate-y-1 group-focus:-translate-y-1 group-active:translate-y-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-foreground">{stats?.totalMembers || 0}</span>
            <p className="text-xs text-muted-foreground mt-1">+ {stats?.recentWeekCount || 0}</p>
          </div>
        </div>

        <div tabIndex={0} className="group bg-card rounded-xl p-6 border border-border shadow-sm flex flex-col justify-between transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1 focus:-translate-y-1 hover:shadow-md focus:shadow-md hover:border-secondary/40 focus:border-secondary/60 active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-muted-foreground text-sm">{t('dashboard.physical_persons')}</h3>
            <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/15 dark:bg-amber-400/20 transition-[background-color,transform] duration-500 ease-out group-hover:-translate-y-1 group-focus:-translate-y-1 group-active:translate-y-0">
              <UserIcon className="h-5 w-5 text-amber-700 dark:text-amber-300" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-foreground">{stats?.totalPhysique || 0}</span>
          </div>
        </div>

        <div tabIndex={0} className="group bg-card rounded-xl p-6 border border-border shadow-sm flex flex-col justify-between transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1 focus:-translate-y-1 hover:shadow-md focus:shadow-md hover:border-primary/30 focus:border-primary/30 active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-muted-foreground text-sm">{t('dashboard.legal_persons')}</h3>
            <div className="h-10 w-10 bg-accent rounded-full flex items-center justify-center transition-transform duration-500 ease-out group-hover:-translate-y-1 group-focus:-translate-y-1 group-active:translate-y-0">
              <Building2 className="h-5 w-5 text-accent-foreground" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-foreground">{stats?.totalMorale || 0}</span>
          </div>
        </div>

        <div tabIndex={0} className="group bg-card rounded-xl p-6 border border-border shadow-sm flex flex-col justify-between transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1 focus:-translate-y-1 hover:shadow-md focus:shadow-md hover:border-rose-400/40 focus:border-rose-400/60 active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-muted-foreground text-sm">{t('dashboard.female_representation')}</h3>
            <div className="h-10 w-10 bg-rose-500/10 rounded-full flex items-center justify-center transition-transform duration-500 ease-out group-hover:-translate-y-1 group-focus:-translate-y-1 group-active:translate-y-0">
              <UserCheck className="h-5 w-5 text-rose-500" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-foreground">{stats?.organisationsRepresenteesParFemmes || 0}</span>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.totalMorale && stats.totalMorale > 0
                ? `${Math.round((stats.organisationsRepresenteesParFemmes / stats.totalMorale) * 100)}`
                : 0}% {t('dashboard.female_represented_orgs')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Par Catégorie */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1 hover:shadow-md hover:border-primary/25">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold text-foreground">{t('dashboard.sector_distribution')}</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {byCategory.map((cat) => {
                const style = CATEGORY_STYLES[cat.category.toLowerCase()];
                return (
                  <div
                    key={cat.category}
                    tabIndex={0}
                    className={`group flex items-center justify-between p-2.5 rounded-lg border border-transparent transition-[background-color,color,transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-0.5 focus:-translate-y-0.5 hover:shadow-sm focus:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${style?.hoverBg ?? 'hover:bg-muted/50'} ${style?.hoverBorder ?? 'hover:border-border'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 transition-[background-color,transform] duration-500 ease-out group-hover:-translate-y-0.5 group-focus:-translate-y-0.5 group-active:translate-y-0 ${style?.iconBg ?? 'bg-muted'} ${style?.groupHoverIconBg ?? ''}`}>
                        {getCategoryIcon(cat.category)}
                      </div>
                      <span className={`font-medium capitalize text-foreground transition-colors ${style?.groupHoverText ?? ''}`}>
                        {cat.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`font-semibold transition-colors ${style?.groupHoverText ?? ''}`}>{cat.count}</span>
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, ((cat.count) / (stats?.totalMembers || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {byCategory.length === 0 && (
                <p className="text-muted-foreground text-center py-4">...</p>
              )}
            </div>
          </div>
        </div>

        {/* Par Région */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1 hover:shadow-md hover:border-primary/25">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold text-foreground">Répartition par Région</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {byRegion.map((reg) => (
                <div tabIndex={0} key={reg.regionName} className="group flex items-center justify-between rounded-lg border border-transparent p-2.5 transition-[background-color,transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-0.5 focus:-translate-y-0.5 hover:bg-muted/50 focus:bg-muted/50 hover:border-border focus:border-border hover:shadow-sm focus:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="font-medium text-foreground">{reg.regionName}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-muted-foreground">{reg.count}</span>
                  </div>
                </div>
              ))}
              {byRegion.length === 0 && (
                <p className="text-muted-foreground text-center py-4">...</p>
              )}
            </div>
          </div>
        </div>

        {/* Par Statut */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1 hover:shadow-md hover:border-primary/25">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold text-foreground">{t('dashboard.distribution_by_type')}</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {byStatus.map((st) => (
                <div tabIndex={0} key={st.status} className="group flex items-center justify-between rounded-lg border border-transparent p-2.5 transition-[background-color,transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-0.5 focus:-translate-y-0.5 hover:bg-muted/50 focus:bg-muted/50 hover:border-border focus:border-border hover:shadow-sm focus:shadow-sm active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="font-medium text-foreground">{getStatusLabel(st.status)}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-muted-foreground">{st.count}</span>
                  </div>
                </div>
              ))}
              {byStatus.length === 0 && (
                <p className="text-muted-foreground text-center py-4">...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
