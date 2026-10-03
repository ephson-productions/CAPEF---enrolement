import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localProfileService, type LocalUserProfile } from '@/lib/local-profile-service';
import { Lock, KeyRound, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';

interface LocalPinUnlockModalProps {
  isOpen: boolean;
  userProfile: LocalUserProfile | null;
  onUnlocked: () => void;
  isExpiredReadonly?: boolean;
}

export function LocalPinUnlockModal({
  isOpen,
  userProfile,
  onUnlocked,
  isExpiredReadonly = false,
}: LocalPinUnlockModalProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !userProfile) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pin || pin.trim().length < 4) {
      setError(t('auth.pin.invalid_length', 'Le code PIN doit comporter au moins 4 chiffres.'));
      return;
    }

    setIsSubmitting(true);
    try {
      const isValid = await localProfileService.verifyPin(userProfile.clerkUserId, pin.trim());
      if (isValid) {
        onUnlocked();
      } else {
        // If no PIN was ever set for this local profile, allow initial local unlock
        if (!userProfile.pinHash) {
          await localProfileService.saveProfile(userProfile, pin.trim());
          onUnlocked();
        } else {
          setError(t('auth.pin.incorrect', 'Code PIN incorrect. Veuillez réessayer.'));
        }
      }
    } catch (err) {
      console.error('[LocalPinUnlockModal] Error during unlock:', err);
      setError(t('common.error', 'Erreur de vérification.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center text-2xl font-bold">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {t('auth.pin.title', 'Déverrouillage Session Hors-Ligne')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {userProfile.name} ({userProfile.email})
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded-full text-xs font-semibold mt-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>not-reverified-offline</span>
          </div>
        </div>

        {isExpiredReadonly && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{t('auth.pin.expired_notice', 'Durée maximale hors-ligne (21 jours) dépassée. Mode lecture seule.')}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-primary" />
              {t('auth.pin.label', 'Saisissez votre code PIN (4-6 chiffres)')}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full px-4 py-3 text-center text-2xl tracking-widest font-mono bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:outline-none"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-destructive font-semibold text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || pin.length < 4}
            className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {isSubmitting ? t('common.loading', 'Vérification...') : t('auth.pin.unlock_btn', 'Déverrouiller')}
          </button>
        </form>
      </div>
    </div>
  );
}
