import React from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useListUsers } from '@workspace/api-client-react';
import { Shield, ShieldAlert, User as UserIcon, Plus, MapPin, Ban, PauseCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useAuthContext } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '@/lib/i18n';

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  if (role === 'admin') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800"><ShieldAlert className="h-3.5 w-3.5" /> {t('users.roles.admin', 'Administrateur')}</span>;
  }
  if (role === 'supervisor') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800"><Shield className="h-3.5 w-3.5" /> {t('users.roles.supervisor', 'Superviseur')}</span>;
  }
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800"><UserIcon className="h-3.5 w-3.5" /> {t('users.roles.agent', 'Agent de terrain')}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === 'banned') {
    return <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"><Ban className="h-3.5 w-3.5" /> {t('users.status.banned', 'Banni')}</span>;
  }
  if (status === 'suspended') {
    return <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"><PauseCircle className="h-3.5 w-3.5" /> {t('users.status.suspended', 'Suspendu')}</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{t('users.status.active', 'Actif')}</span>;
}

export default function UsersList() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { isAdmin } = useAuthContext();
  const [, setLocation] = useLocation();
  const { data: users, isLoading } = useListUsers(undefined, {
    query: { queryKey: ['users'], refetchOnMount: 'always', staleTime: 0 },
  });

  if (!isAdmin) return <Redirect to="/dashboard" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('users.title', 'Gestion des Utilisateurs')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('users.subtitle', 'Gérez les accès, les rôles et les zones du personnel CAPEF.')}</p>
        </div>
        <Link href="/users/new" className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" /> {t('users.add_agent', 'Ajouter un agent')}
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-semibold">{t('users.table.user', 'Utilisateur')}</th>
                <th className="px-6 py-3 font-semibold">{t('users.table.role', 'Rôle')}</th>
                <th className="px-6 py-3 font-semibold">{t('users.table.status', 'Statut')}</th>
                <th className="px-6 py-3 font-semibold">{t('users.table.assigned_zones', 'Zones assignées')}</th>
                <th className="px-6 py-3 font-semibold">{t('users.table.created_at', 'Création')}</th>
                <th className="px-6 py-3 text-right font-semibold">{t('users.table.actions', 'Détail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && Array.from({ length: 4 }).map((_, index) => (
                <tr key={index} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-10 w-48 rounded bg-muted" /></td>
                  <td className="px-6 py-4"><div className="h-6 w-28 rounded-full bg-muted" /></td>
                  <td className="px-6 py-4"><div className="h-6 w-20 rounded-full bg-muted" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-muted" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-muted" /></td>
                  <td className="px-6 py-4"><div className="ml-auto h-8 w-16 rounded bg-muted" /></td>
                </tr>
              ))}
              {!isLoading && !users?.length && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">{t('users.no_users', 'Aucun utilisateur enregistré.')}</td></tr>
              )}
              {!isLoading && users?.map((user) => (
                <tr
                  key={user.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => setLocation(`/users/${user.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setLocation(`/users/${user.id}`);
                  }}
                  className="cursor-pointer transition-colors hover:bg-muted/20 focus:bg-muted/20 focus:outline-none"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {user.profilePhotoUrl ? (
                        <img src={user.profilePhotoUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/10" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{user.name.charAt(0).toUpperCase()}</div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4"><RoleBadge role={user.role} /></td>
                  <td className="px-6 py-4"><StatusBadge status={user.status} /></td>
                  <td className="px-6 py-4 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {user.assignedZones?.length || 0} {t('users.combinations', 'combinaison(s)')}</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">{format(new Date(user.createdAt), 'dd MMM yyyy', { locale: dateLocale })}</td>
                  <td className="px-6 py-4 text-right"><span className="font-semibold text-primary">{t('users.open', 'Ouvrir →')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
