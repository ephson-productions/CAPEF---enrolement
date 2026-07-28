import React from 'react';
import { useGetDashboardStats } from '@workspace/api-client-react';
import { Users, Building2, Trees, Droplets, Tractor, Hammer, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse"></div>)}
        </div>
      </div>
    );
  }

  const getCategoryIcon = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'agriculteur': return <Tractor className="h-5 w-5 text-primary" />;
      case 'pecheur': return <Droplets className="h-5 w-5 text-blue-500" />;
      case 'eleveur': return <Building2 className="h-5 w-5 text-orange-500" />;
      case 'forestier': return <Trees className="h-5 w-5 text-green-700" />;
      case 'artisan': return <Hammer className="h-5 w-5 text-purple-500" />;
      default: return <Users className="h-5 w-5 text-primary" />;
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tableau de Bord</h1>
          <p className="text-muted-foreground mt-1">Aperçu général des enrôlements CAPEF.</p>
        </div>

        <Link
          href="/members/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg shadow hover:bg-primary/90 transition-colors"
        >
          Nouvel Enrôlement
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card rounded-xl p-6 border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-muted-foreground">Total Enrôlés</h3>
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-foreground">{stats?.totalMembers || 0}</span>
            <p className="text-sm text-muted-foreground mt-1">+ {stats?.recentWeekCount || 0} cette semaine</p>
          </div>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-muted-foreground">Personnes Physiques</h3>
            <div className="h-10 w-10 bg-secondary/10 rounded-full flex items-center justify-center">
              <UserIcon className="h-5 w-5 text-secondary-foreground" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-foreground">{stats?.totalPhysique || 0}</span>
          </div>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-muted-foreground">Personnes Morales</h3>
            <div className="h-10 w-10 bg-accent rounded-full flex items-center justify-center">
              <Building2 className="h-5 w-5 text-accent-foreground" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-foreground">{stats?.totalMorale || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Par Catégorie */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold text-foreground">Répartition par Catégorie</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {stats?.byCategory.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                      {getCategoryIcon(cat.category)}
                    </div>
                    <span className="font-medium capitalize text-foreground">{cat.category}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold">{cat.count}</span>
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, ((cat.count) / (stats.totalMembers || 1)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
              {(!stats?.byCategory || stats.byCategory.length === 0) && (
                <p className="text-muted-foreground text-center py-4">Aucune donnée disponible.</p>
              )}
            </div>
          </div>
        </div>

        {/* Par Région */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-bold text-foreground">Répartition par Région</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {stats?.byRegion.map((reg) => (
                <div key={reg.regionName} className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{reg.regionName}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-muted-foreground">{reg.count}</span>
                  </div>
                </div>
              ))}
              {(!stats?.byRegion || stats.byRegion.length === 0) && (
                <p className="text-muted-foreground text-center py-4">Aucune donnée disponible.</p>
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
  )
}
