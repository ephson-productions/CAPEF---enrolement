import React, { useState } from 'react';
import { useListUsers, useUpdateUser } from '@workspace/api-client-react';
import type { AppUserUpdateRole } from '@workspace/api-client-react';
import { Shield, ShieldAlert, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAuthContext } from '@/lib/auth';
import { Redirect } from 'wouter';

export default function UsersList() {
  const { isAdmin } = useAuthContext();
  const { toast } = useToast();
  const { data: users, isLoading, refetch } = useListUsers();
  const updateUser = useUpdateUser();
  const [editingRole, setEditingRole] = useState<number | null>(null);

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  const handleRoleChange = async (userId: number, newRole: AppUserUpdateRole) => {
    try {
      await updateUser.mutateAsync({ id: userId, data: { role: newRole } });
      toast({ title: 'Rôle mis à jour', description: 'Le rôle de l\'utilisateur a été modifié avec succès.' });
      setEditingRole(null);
      refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de modifier le rôle.' });
    }
  };

  const getRoleBadge = (role: string) => {
    switch(role) {
      case 'admin': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200"><ShieldAlert className="h-3.5 w-3.5" /> Administrateur</span>;
      case 'supervisor': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200"><Shield className="h-3.5 w-3.5" /> Superviseur</span>;
      default: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200"><UserIcon className="h-3.5 w-3.5" /> Agent de terrain</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestion des Utilisateurs</h1>
        <p className="text-sm text-muted-foreground mt-1">Gérez les accès et les rôles du personnel CAPEF.</p>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/30 uppercase border-b border-border">
              <tr>
                <th className="px-6 py-3 font-semibold">Utilisateur</th>
                <th className="px-6 py-3 font-semibold">Email</th>
                <th className="px-6 py-3 font-semibold">Rôle</th>
                <th className="px-6 py-3 font-semibold">Région Assig.</th>
                <th className="px-6 py-3 font-semibold">Création</th>
                <th className="px-6 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-3/4"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-1/2"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-muted rounded-full w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-1/2"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted rounded w-1/3"></div></td>
                    <td className="px-6 py-4"><div className="h-8 bg-muted rounded w-16 ml-auto"></div></td>
                  </tr>
                ))
              ) : (
                users?.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{u.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                    <td className="px-6 py-4">
                      {editingRole === u.id ? (
                        <select 
                          autoFocus
                          defaultValue={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as AppUserUpdateRole)}
                          onBlur={() => setEditingRole(null)}
                          className="px-2 py-1 text-sm rounded border border-primary focus:ring-1 focus:ring-primary outline-none"
                        >
                          <option value="agent">Agent de terrain</option>
                          <option value="supervisor">Superviseur</option>
                          <option value="admin">Administrateur</option>
                        </select>
                      ) : (
                        getRoleBadge(u.role)
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{u.regionName || 'Toutes'}</td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {format(new Date(u.createdAt), 'dd MMM yyyy', { locale: fr })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setEditingRole(u.id)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Modifier rôle
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
