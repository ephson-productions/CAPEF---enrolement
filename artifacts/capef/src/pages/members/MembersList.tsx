import React, { useState } from 'react';
import { useListMembers, useListUsers, getExportMembersUrl } from '@workspace/api-client-react';
import type { ListMembersCategory, ListMembersMemberType, ListMembersStatus } from '@workspace/api-client-react';
import { Link } from 'wouter';
import {
  Search, Download, Plus, FileText, ChevronLeft, ChevronRight, User as UserIcon, Building2, Eye, Edit, MapPin
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthContext } from '@/lib/auth';

export default function MembersList() {
  const { isAdmin, isSupervisor } = useAuthContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ListMembersCategory | undefined>();
  const [memberType, setMemberType] = useState<ListMembersMemberType | undefined>();
  const [status, setStatus] = useState<ListMembersStatus | undefined>();
  const [agentId, setAgentId] = useState<number | undefined>(undefined);

  const { data, isLoading } = useListMembers(
    { page, search: search || undefined, category, memberType, status, createdById: agentId },
    {
      query: {
        queryKey: ['members', { page, search, category, memberType, status, agentId }],
        placeholderData: (prev) => prev,
      }
    }
  );

  // List all users to populate the Agent Recenseur picker for Admin/Supervisor
  const { data: users } = useListUsers({}, {
    query: {
      enabled: isAdmin || isSupervisor,
      queryKey: ['users-list']
    }
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    try {
      const url = getExportMembersUrl({ category, memberType });
      window.open(url, '_blank');
    } finally {
      setIsExporting(false);
    }
  };

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

  const getStatusBadgeColor = (statusVal: string) => {
    switch (statusVal) {
      case 'incomplet': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'en_attente': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'valide': return 'bg-green-100 text-green-800 border-green-200';
      case 'desactive': return 'bg-red-100 text-red-800 border-red-200';
      case 'bloque': return 'bg-red-200 text-red-900 border-red-300 font-bold';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Registre des Membres</h1>
          <p className="text-sm text-muted-foreground mt-1">Gérez les acteurs agropastoraux enregistrés.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground font-semibold rounded-md shadow-sm hover:bg-secondary/90 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exporter CSV</span>
          </button>
          <Link
            href="/members/new"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Nouveau</span>
          </Link>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
        {/* Filters */}
        <div className={`p-4 border-b border-border bg-muted/10 grid grid-cols-1 gap-4 ${(isAdmin || isSupervisor) ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          <div className="relative col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher (Nom, N° Membre...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
            />
          </div>

          <select
            value={memberType || ''}
            onChange={(e) => setMemberType(e.target.value ? e.target.value as ListMembersMemberType : undefined)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
          >
            <option value="">Tous les types</option>
            <option value="physique">Personne Physique</option>
            <option value="morale">Personne Morale</option>
          </select>

          <select
            value={category || ''}
            onChange={(e) => setCategory(e.target.value ? e.target.value as ListMembersCategory : undefined)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
          >
            <option value="">Toutes les catégories</option>
            <option value="agriculteur">Agriculteur</option>
            <option value="pecheur">Pêcheur</option>
            <option value="eleveur">Élever</option>
            <option value="forestier">Exploitant Forestier</option>
            <option value="artisan">Artisan</option>
          </select>

          <select
            value={status || ''}
            onChange={(e) => setStatus(e.target.value ? e.target.value as ListMembersStatus : undefined)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
          >
            <option value="">Tous les statuts</option>
            <option value="incomplet">Incomplet</option>
            <option value="en_attente">En attente</option>
            <option value="valide">Validé</option>
            <option value="desactive">Désactivé</option>
            <option value="bloque">Bloqué</option>
          </select>

          {(isAdmin || isSupervisor) && (
            <select
              value={agentId || ''}
              onChange={(e) => setAgentId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
            >
              <option value="">Tous les agents</option>
              {users?.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/30 uppercase border-b border-border">
              <tr>
                <th className="px-6 py-3 font-semibold">Membre</th>
                <th className="px-6 py-3 font-semibold">N° Matricule</th>
                <th className="px-6 py-3 font-semibold">Catégorie</th>
                <th className="px-6 py-3 font-semibold">Statut</th>
                <th className="px-6 py-3 font-semibold">Localisation</th>
                <th className="px-6 py-3 font-semibold">Date</th>
                <th className="px-6 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-3/4"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-1/2"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-muted rounded-full w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-muted rounded-full w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-1/2"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-1/3"></div></td>
                    <td className="px-6 py-4"><div className="h-8 bg-muted rounded w-16 ml-auto"></div></td>
                  </tr>
                ))
              ) : data?.data?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-base font-medium">Aucun membre trouvé.</p>
                    <p className="text-sm">Essayez de modifier vos filtres de recherche.</p>
                  </td>
                </tr>
              ) : (
                data?.data?.map((member) => (
                  <tr key={member.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {member.memberType === 'physique' ? <UserIcon className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{member.displayName}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            {member.memberType === 'physique' ? 'Pers. Physique' : 'Pers. Morale'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{member.memberNumber}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${getCategoryColor(member.category)} capitalize`}>
                        {member.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${getStatusBadgeColor(member.status)} capitalize`}>
                        {member.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[120px]">{member.regionName || 'Non défini'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {format(new Date(member.createdAt), 'dd MMM yyyy', { locale: fr })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/members/${member.id}`}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/members/${member.id}/edit`}
                          className="p-1.5 text-muted-foreground hover:text-secondary-foreground hover:bg-secondary/20 rounded-md transition-colors"
                          title="Modifier"
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && data && data.total > 0 && (
          <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Affichage de {((page - 1) * data.limit) + 1} à {Math.min(page * data.limit, data.total)} sur {data.total}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 border border-input rounded bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * data.limit >= data.total}
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
