import React from 'react';
import { useAuthContext } from '@/lib/auth';
import { Mail, Shield, MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Profile() {
  const { user, isLoading } = useAuthContext();

  if (isLoading || !user) {
    return <div className="animate-pulse p-8">Chargement...</div>;
  }

  const getRoleName = (role: string) => {
    if (role === 'admin') return 'Administrateur Système';
    if (role === 'supervisor') return 'Superviseur Régional';
    return 'Agent de Terrain';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mon Profil</h1>
        <p className="text-sm text-muted-foreground mt-1">Vos informations de compte et d'accès.</p>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-8 flex flex-col md:flex-row items-center gap-8 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
          <div className="h-28 w-28 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-4xl font-bold shadow-lg">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="text-center md:text-left">
            <h2 className="text-3xl font-bold text-foreground">{user.name}</h2>
            <p className="text-lg text-muted-foreground">{getRoleName(user.role)}</p>
          </div>
        </div>

        <div className="p-8">
          <h3 className="text-lg font-bold mb-6">Informations de compte</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-muted rounded-lg text-muted-foreground shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Adresse Email</p>
                <p className="font-medium text-foreground">{user.email}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-muted rounded-lg text-muted-foreground shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Niveau d'accès</p>
                <p className="font-medium text-foreground capitalize">{user.role}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-muted rounded-lg text-muted-foreground shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Région assignée</p>
                <p className="font-medium text-foreground">{user.regionName || 'Toutes les régions (National)'}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-muted rounded-lg text-muted-foreground shrink-0">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Membre depuis</p>
                <p className="font-medium text-foreground">
                  {format(new Date(user.createdAt), 'dd MMMM yyyy', { locale: fr })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
