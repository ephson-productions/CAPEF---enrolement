import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuthContext } from '@/lib/auth';
import { useOfflineQueue } from '@/lib/offline-sync';
import { useClerk } from '@clerk/react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  LogOut,
  Menu,
  Wifi,
  WifiOff,
  User,
  ShieldAlert
} from 'lucide-react';

export default function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user, isAdmin, isLoading } = useAuthContext();
  const { isOnline, queueCount, syncNow, isSyncing } = useOfflineQueue();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Registre des membres', href: '/members', icon: Users },
    { name: 'Nouvel Enrôlement', href: '/members/new', icon: UserPlus },
    ...(isAdmin ? [{ name: 'Utilisateurs', href: '/users', icon: ShieldAlert }] : []),
  ];

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Mobile sidebar backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border
        transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static
        flex flex-col
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar shrink-0">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.png`} alt="CAPEF" className="h-8 w-8 mr-3 object-contain" />
          <span className="text-sidebar-foreground font-bold text-lg tracking-tight">CAPEF</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={closeMobileMenu}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-md font-medium
                  transition-[background-color,color,transform,box-shadow] duration-200
                  hover:translate-x-1 hover:shadow-sm
                  ${isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }
                `}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border shrink-0">
          <Link
            href="/profile"
            onClick={closeMobileMenu}
            className="flex items-center gap-3 px-3 py-2 mb-2 rounded-md text-sidebar-foreground transition-[background-color,color,transform,box-shadow] duration-200 hover:translate-x-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
          >
            <div className="h-8 w-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
              {user?.name?.charAt(0).toUpperCase() || <User size={16} />}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.name || 'Chargement...'}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role || ''}</p>
            </div>
          </Link>

          <button
            onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-destructive-foreground/80 rounded-md transition-[background-color,color,transform,box-shadow] duration-200 hover:translate-x-1 hover:text-destructive-foreground hover:bg-destructive/20 hover:shadow-sm"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Déconnexion
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-8 shrink-0 shadow-sm z-10 relative">
          <div className="flex items-center lg:hidden">
            <button
              onClick={toggleMobileMenu}
              className="p-2 -ml-2 mr-2 text-muted-foreground hover:bg-muted rounded-md"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="font-bold text-foreground">CAPEF</span>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            {/* Sync Status Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${isOnline ? (queueCount > 0 ? 'bg-secondary/20 text-secondary-foreground' : 'bg-primary/10 text-primary') : 'bg-destructive/10 text-destructive'}`}>
              {isOnline ? (
                <>
                  <Wifi className="h-4 w-4" />
                  <span className="hidden sm:inline">En ligne</span>
                  {queueCount > 0 && (
                    <button
                      onClick={() => syncNow()}
                      disabled={isSyncing}
                      className="ml-2 underline hover:no-underline font-bold"
                    >
                      {isSyncing ? '...' : `Sync ${queueCount}`}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4" />
                  <span>Hors ligne {queueCount > 0 && `(${queueCount})`}</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
