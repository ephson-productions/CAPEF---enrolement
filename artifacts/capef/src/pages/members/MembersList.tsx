import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { memberRepository, type MemberFilterOptions, type LocalMemberWithDetails } from '@/lib/repositories/MemberRepository';
import { useOfflineQueue } from '@/lib/offline-sync';
import { useAuthContext } from '@/lib/auth';
import { customFetch } from '@workspace/api-client-react';
import { getCategoryLabel, getStatusLabel } from '@/lib/i18n-helpers';
import { useDateLocale } from '@/lib/i18n';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Search,
  Plus,
  Filter,
  RefreshCw,
  User as UserIcon,
  Building2,
  MapPin,
  Eye,
  Edit,
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

export default function MembersList() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [, setLocation] = useLocation();
  const { effectiveUserId, isOnline } = useOfflineQueue();
  const { user } = useAuthContext();

  const userRole = (user?.role as string) || '';
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor' || userRole === 'superviseur';

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [representantGenre, setRepresentantGenre] = useState<string>('all');
  const [agentId, setAgentId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const [users, setUsers] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [revalidating, setRevalidating] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [membersData, setMembersData] = useState<{
    data: any[];
    total: number;
    page: number;
    limit: number;
  }>({ data: [], total: 0, page: 1, limit: 10 });

  // Load agents list for admin/supervisor filter
  useEffect(() => {
    if ((isAdmin || isSupervisor) && isOnline) {
      customFetch('/api/users')
        .then((res: any) => {
          if (Array.isArray(res)) {
            setUsers(res);
          } else if (Array.isArray(res?.data)) {
            setUsers(res.data);
          }
        })
        .catch(() => {
          // Non-blocking error if offline or permission denied
        });
    }
  }, [isAdmin, isSupervisor, isOnline]);

  // Stale-While-Revalidate Member Listing
  useEffect(() => {
    let isCancelled = false;

    const loadMembersStaleWhileRevalidate = async () => {
      setLoading(true);
      const opts: MemberFilterOptions = {
        category: filterCategory !== 'all' ? filterCategory : undefined,
        memberType: filterType !== 'all' ? filterType : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchQuery.trim() ? searchQuery : undefined,
        representantGenre: representantGenre !== 'all' ? representantGenre : undefined,
        agentId: agentId !== 'all' ? Number(agentId) : undefined,
        page,
        limit: 10,
      };

      try {
        // 1. Stale read from Dexie IndexedDB
        const localRes = await memberRepository.getMembers(effectiveUserId, opts);
        if (!isCancelled) {
          setMembersData(localRes);
          setLoading(false);
        }

        // 2. Network revalidation (write-through into Dexie)
        if (isOnline) {
          if (!isCancelled) setRevalidating(true);
          const params = new URLSearchParams();
          params.set('page', String(page));
          params.set('limit', '100');
          if (opts.category) params.set('category', opts.category);
          if (opts.memberType) params.set('memberType', opts.memberType);
          if (opts.status) params.set('status', opts.status);
          if (opts.search) params.set('search', opts.search);
          if (opts.representantGenre) params.set('representantGenre', opts.representantGenre);
          if (opts.agentId) params.set('createdById', String(opts.agentId));

          const apiRes = (await customFetch(`/api/members?${params.toString()}`)) as any;
          const serverMembers = Array.isArray(apiRes) ? apiRes : apiRes?.data || [];

          if (Array.isArray(serverMembers) && !isCancelled) {
            await memberRepository.upsertServerMembers(effectiveUserId, serverMembers);
            const updatedRes = await memberRepository.getMembers(effectiveUserId, opts);
            if (!isCancelled) {
              setMembersData(updatedRes);
            }
          }
        }
      } catch (err) {
        console.warn('[MembersList] Stale-while-revalidate error:', err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
          setRevalidating(false);
        }
      }
    };

    loadMembersStaleWhileRevalidate();

    return () => {
      isCancelled = true;
    };
  }, [
    effectiveUserId,
    filterCategory,
    filterType,
    filterStatus,
    representantGenre,
    agentId,
    searchQuery,
    page,
    isOnline,
  ]);

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterType !== 'all') params.set('memberType', filterType);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/members/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `membres_capef_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('[MembersList] Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'agriculteur':
      case 'agriculture':
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300';
      case 'pecheur':
      case 'peche':
      case 'pêcheur':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300';
      case 'eleveur':
      case 'elevage':
      case 'éleveur':
        return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300';
      case 'forestier':
      case 'foret':
        return 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-300';
      case 'artisan':
      case 'artisanat':
        return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'incomplet':
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300';
      case 'en_attente':
        return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300';
      case 'valide':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300';
      case 'desactive':
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300';
      case 'bloque':
        return 'bg-red-200 text-red-900 border-red-300 font-bold dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">
              {t('members.title', 'Member Registry')}
            </h1>
            {revalidating && (
              <RefreshCw className="w-4 h-4 text-primary animate-spin" />
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {t('members.subtitle', 'View and manage all enrolled agropastoral actors')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isOnline && (
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={exporting}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting
                ? t('common.exporting', 'Exportation...')
                : t('members.export_csv', 'Export CSV')}
            </Button>
          )}
          <Button
            onClick={() => setLocation('/members/new')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('navigation.new_enrollment', 'Nouvel Enrôlement')}
          </Button>
        </div>
      </div>

      {/* Search & Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {t('common.filters', 'Filtres de recherche')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Search Input */}
            <div className="relative xl:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder={t('common.search_placeholder', 'Rechercher par nom, matricule...')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>

            {/* Category Filter */}
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
            >
              <option value="all">{t('common.all_categories', 'Tous les secteurs')}</option>
              <option value="agriculteur">{getCategoryLabel('agriculteur', t)}</option>
              <option value="pecheur">{getCategoryLabel('pecheur', t)}</option>
              <option value="eleveur">{getCategoryLabel('eleveur', t)}</option>
              <option value="forestier">{getCategoryLabel('forestier', t)}</option>
              <option value="artisan">{getCategoryLabel('artisan', t)}</option>
            </select>

            {/* Member Type Filter */}
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
            >
              <option value="all">{t('common.all_types', 'Tous les types')}</option>
              <option value="physique">{t('members.type_physique', 'Personne Physique')}</option>
              <option value="morale">{t('members.type_morale', 'Personne Morale')}</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
            >
              <option value="all">{t('common.all_statuses', 'Tous les statuts')}</option>
              <option value="incomplet">{getStatusLabel('incomplet', t)}</option>
              <option value="en_attente">{getStatusLabel('en_attente', t)}</option>
              <option value="valide">{getStatusLabel('valide', t)}</option>
              <option value="desactive">{getStatusLabel('desactive', t)}</option>
              <option value="bloque">{getStatusLabel('bloque', t)}</option>
            </select>

            {/* Representant Genre Filter (when memberType !== 'physique') */}
            {filterType !== 'physique' && (
              <select
                value={representantGenre}
                onChange={(e) => {
                  setRepresentantGenre(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
              >
                <option value="all">
                  {t('members.filters.all_representations', 'Tous les types de représentation')}
                </option>
                <option value="femme">
                  {t('members.filters.represented_by_woman', 'Représentée par une femme')}
                </option>
                <option value="homme">
                  {t('members.filters.represented_by_man', 'Représentée par un homme')}
                </option>
              </select>
            )}

            {/* Agent Filter (Admin / Supervisor only) */}
            {(isAdmin || isSupervisor) && (
              <select
                value={agentId}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
              >
                <option value="all">{t('members.filters.all_agents', 'Tous les agents')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table Container */}
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {t('common.loading', 'Chargement des données...')}
          </div>
        ) : membersData.data.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-lg font-medium">
              {t('members.no_members_found', 'Aucun membre trouvé.')}
            </p>
            <p className="text-sm mt-1">
              {t('members.try_changing_filters', 'Essayez de modifier vos critères de recherche.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/30 uppercase border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-semibold">
                    {t('members.table.member', 'Membre')}
                  </th>
                  <th className="px-6 py-3 font-semibold">
                    {t('members.table.member_number', 'N° Matricule')}
                  </th>
                  <th className="px-6 py-3 font-semibold">
                    {t('members.table.category', 'Catégorie')}
                  </th>
                  <th className="px-6 py-3 font-semibold">
                    {t('members.table.status', 'Statut')}
                  </th>
                  <th className="px-6 py-3 font-semibold">
                    {t('members.table.location', 'Localisation')}
                  </th>
                  <th className="px-6 py-3 font-semibold">
                    {t('members.table.date', 'Date')}
                  </th>
                  <th className="px-6 py-3 font-semibold text-right">
                    {t('common.actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {membersData.data.map((member) => (
                  <tr
                    key={member.localId}
                    className="hover:bg-muted/10 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/members/${member.serverId || member.localId}`)}
                  >
                    {/* Member Avatar & Title */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {member.memberType === 'physique' ? (
                            <UserIcon className="h-4 w-4" />
                          ) : (
                            <Building2 className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{member.displayName}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            {member.memberType === 'physique'
                              ? t('members.types.physique_short', 'Pers. Physique')
                              : t('members.types.morale_short', 'Pers. Morale')}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Member Number */}
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-foreground">
                      {member.memberNumber || member.localId.slice(0, 8)}
                    </td>

                    {/* Category */}
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getCategoryColor(member.category)} capitalize`}
                      >
                        {getCategoryLabel(member.category, t)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {member.syncStatus === 'pending' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300">
                          <AlertCircle className="w-3 h-3" />
                          {t('members.sync_pending', 'En attente de synchro')}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadgeColor(member.status)} capitalize`}
                        >
                          {getStatusLabel(member.status, t)}
                        </span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-[150px]">
                          {member.regionName || t('common.not_defined', 'Non défini')}
                        </span>
                      </div>
                    </td>

                    {/* Creation Date */}
                    <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                      {member.createdAt
                        ? format(new Date(member.createdAt), 'dd MMM yyyy', { locale: dateLocale })
                        : '-'}
                    </td>

                    {/* Action Icons */}
                    <td className="px-6 py-4 text-right">
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/members/${member.serverId || member.localId}`}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                          title={t('common.view_details', 'Voir les détails')}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/members/${member.serverId || member.localId}/edit`}
                          className="p-1.5 text-muted-foreground hover:text-secondary-foreground hover:bg-secondary/20 rounded-md transition-colors"
                          title={t('common.edit', 'Modifier')}
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && membersData.total > 0 && (
          <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-between text-sm">
            <span className="text-muted-foreground text-xs">
              {t('common.pagination_info', 'Affichage de {{from}} à {{to}} sur {{total}}', {
                from: (page - 1) * membersData.limit + 1,
                to: Math.min(page * membersData.limit, membersData.total),
                total: membersData.total,
              })}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 border border-input rounded bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * membersData.limit >= membersData.total}
                className="p-1.5 border border-input rounded bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
