import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { memberRepository, type MemberFilterOptions, type LocalMemberWithDetails } from '@/lib/repositories/MemberRepository';
import { useOfflineQueue } from '@/lib/offline-sync';
import { customFetch } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Plus, Filter, RefreshCw, UserCheck, AlertCircle } from 'lucide-react';

export default function MembersList() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { effectiveUserId, isOnline } = useOfflineQueue();

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(true);
  const [revalidating, setRevalidating] = useState<boolean>(false);
  const [membersData, setMembersData] = useState<{
    data: any[];
    total: number;
    page: number;
    limit: number;
  }>({ data: [], total: 0, page: 1, limit: 10 });

  useEffect(() => {
    let isCancelled = false;

    const loadMembersStaleWhileRevalidate = async () => {
      setLoading(true);
      const opts: MemberFilterOptions = {
        category: filterCategory !== 'all' ? filterCategory : undefined,
        memberType: filterType !== 'all' ? filterType : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchQuery.trim() ? searchQuery : undefined,
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

          const apiRes = await customFetch(`/api/members?${params.toString()}`) as any;
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
  }, [effectiveUserId, filterCategory, filterType, filterStatus, searchQuery, page, isOnline]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{t('members.title', 'Gestion des Membres')}</h1>
            {revalidating && (
              <RefreshCw className="w-4 h-4 text-primary animate-spin" />
            )}
          </div>
          <p className="text-muted-foreground mt-1">{t('members.subtitle', 'Consultez, recherchez et gérez les acteurs agropastoraux enrôlés.')}</p>
        </div>
        <Button onClick={() => setLocation('/members/new')} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
          <Plus className="w-4 h-4" />
          {t('navigation.new_enrollment', 'Nouvel Enrôlement')}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {t('common.filters', 'Filtres de recherche')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder={t('common.search_placeholder', 'Rechercher par nom, matricule...')}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>

            <Select value={filterCategory} onValueChange={(val) => { setFilterCategory(val); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('members.category', 'Secteur d\'activité')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all_categories', 'Tous les secteurs')}</SelectItem>
                <SelectItem value="agriculteur">{t('members.categories.agriculteur', 'Agriculture')}</SelectItem>
                <SelectItem value="pecheur">{t('members.categories.pecheur', 'Pêche')}</SelectItem>
                <SelectItem value="eleveur">{t('members.categories.eleveur', 'Élevage')}</SelectItem>
                <SelectItem value="forestier">{t('members.categories.forestier', 'Forêt')}</SelectItem>
                <SelectItem value="artisan">{t('members.categories.artisan', 'Artisanat')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={(val) => { setFilterType(val); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('members.type', 'Type de membre')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all_types', 'Tous les types')}</SelectItem>
                <SelectItem value="physique">{t('members.type_physique', 'Personne Physique')}</SelectItem>
                <SelectItem value="morale">{t('members.type_morale', 'Personne Morale')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(val) => { setFilterStatus(val); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('members.status', 'Statut')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all_statuses', 'Tous les statuts')}</SelectItem>
                <SelectItem value="incomplet">{t('members.status.incomplet', 'Incomplet')}</SelectItem>
                <SelectItem value="en_attente">{t('members.status.en_attente', 'En attente')}</SelectItem>
                <SelectItem value="valide">{t('members.status.valide', 'Validé')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {t('common.loading', 'Chargement des données locales...')}
          </div>
        ) : membersData.data.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <p className="text-lg font-medium">{t('members.no_members_found', 'Aucun membre trouvé')}</p>
            <p className="text-sm mt-1">{t('members.try_changing_filters', 'Essayez de modifier vos critères de recherche.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                <tr>
                  <th className="px-4 py-3">{t('members.table.member_number', 'Matricule / ID')}</th>
                  <th className="px-4 py-3">{t('members.table.name', 'Nom / Dénomination')}</th>
                  <th className="px-4 py-3">{t('members.table.category', 'Secteur')}</th>
                  <th className="px-4 py-3">{t('members.table.location', 'Localisation')}</th>
                  <th className="px-4 py-3">{t('members.table.status', 'Statut')}</th>
                  <th className="px-4 py-3 text-right">{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {membersData.data.map((m) => (
                  <tr key={m.localId} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setLocation(`/members/${m.serverId || m.localId}`)}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                      {m.memberNumber || m.localId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {m.displayName}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">
                        {m.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {[m.regionName, m.departmentName, m.arrondissementName].filter(Boolean).join(' > ') || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {m.syncStatus === 'pending' ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {t('members.sync_pending', 'En attente de synchro')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200">
                            <UserCheck className="w-3 h-3 mr-1" />
                            {m.status}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setLocation(`/members/${m.serverId || m.localId}`); }}>
                        {t('common.view', 'Consulter')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {membersData.total > membersData.limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t('common.pagination_info', 'Affichage de {{from}} à {{to}} sur {{total}}', {
                from: (page - 1) * membersData.limit + 1,
                to: Math.min(page * membersData.limit, membersData.total),
                total: membersData.total,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                {t('common.previous', 'Précédent')}
              </Button>
              <Button variant="outline" size="sm" disabled={page * membersData.limit >= membersData.total} onClick={() => setPage(p => p + 1)}>
                {t('common.next', 'Suivant')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
