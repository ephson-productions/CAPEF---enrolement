import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, Building, CheckCircle2, User, XCircle } from 'lucide-react';
import { getCategoryLabel } from '@/lib/i18n-helpers';

interface PublicBadgeMember {
  memberNumber: string;
  displayName: string;
  memberType: 'physique' | 'morale';
  category: string;
  regionName: string | null;
  isValid: boolean;
  photoUrl: string | null;
}

type VerificationState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; member: PublicBadgeMember };

function parsePublicBadgeMember(value: unknown): PublicBadgeMember {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid verification response');
  }

  const data = value as Record<string, unknown>;
  if (
    typeof data.memberNumber !== 'string' ||
    typeof data.displayName !== 'string' ||
    (data.memberType !== 'physique' && data.memberType !== 'morale') ||
    typeof data.category !== 'string' ||
    typeof data.isValid !== 'boolean'
  ) {
    throw new Error('Invalid verification response');
  }

  return {
    memberNumber: data.memberNumber,
    displayName: data.displayName,
    memberType: data.memberType,
    category: data.category,
    regionName: typeof data.regionName === 'string' ? data.regionName : null,
    isValid: data.isValid,
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
  };
}

export default function PublicBadgeVerify() {
  const { t } = useTranslation();
  const [, params] = useRoute('/badge-verify/:token');
  const token = params?.token ?? '';
  const [state, setState] = useState<VerificationState>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error' });
      return;
    }

    const controller = new AbortController();
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
    const url = `${apiBase}/api/public/members/badge/${encodeURIComponent(token)}`;
    setState({ status: 'loading' });

    fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Badge verification failed');
        return parsePublicBadgeMember(await response.json());
      })
      .then((member) => setState({ status: 'ready', member }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });

    return () => controller.abort();
  }, [token]);

  if (state.status === 'loading') {
    return (
      <main className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div role="status" className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">
            {t('badge.verifying', "Vérification de l'enrôlement...")}
          </p>
        </div>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <section className="max-w-md w-full bg-card rounded-2xl border border-border shadow-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertOctagon className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {t('badge.verify_failed_title', 'Échec de la vérification')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'badge.verify_failed_desc',
              "Le code scanné n'est pas valide ou le membre est introuvable dans le registre CAPEF.",
            )}
          </p>
        </section>
      </main>
    );
  }

  const { member } = state;
  const isPhysique = member.memberType === 'physique';

  return (
    <main className="min-h-screen bg-muted/30 text-foreground pb-12">
      <header className="bg-primary text-primary-foreground py-6 px-4 shadow-md text-center space-y-1">
        <h1 className="text-lg font-bold tracking-wide uppercase">CAPEF Cameroun</h1>
        <p className="text-xs opacity-90">
          {t('badge.portal_subtitle', 'Portail public de vérification des enrôlements')}
        </p>
      </header>

      <section className="max-w-md mx-auto px-4 mt-6">
        <div className="bg-card rounded-2xl border border-border shadow-md p-6 text-center space-y-4">
          <div
            role="status"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${
              member.isValid
                ? 'bg-green-100 text-green-800 border-green-200'
                : 'bg-red-100 text-red-800 border-red-200'
            }`}
          >
            {member.isValid ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            )}
            {t(
              member.isValid ? 'badge.status_valid' : 'badge.status_invalid',
              member.isValid ? 'Enrôlement valide' : 'Enrôlement non valide',
            )}
          </div>

          {member.photoUrl && (
            <img
              src={member.photoUrl}
              alt=""
              className="mx-auto w-24 h-24 rounded-full object-cover border-2 border-primary/20 shadow"
            />
          )}

          <h2 className="text-lg font-extrabold text-foreground">{member.displayName}</h2>
          <p className="text-xs text-muted-foreground font-mono bg-muted py-1.5 px-3 rounded inline-block">
            {t('members.detail.member_number', 'N° membre')}: {member.memberNumber}
          </p>

          <dl className="text-left border-t border-border pt-4 space-y-3 text-sm">
            <div className="flex items-center gap-3">
              {isPhysique ? (
                <User className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <Building className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
              <dt className="text-muted-foreground">{t('members.detail.type', 'Type')}</dt>
              <dd className="ml-auto font-semibold">
                {t(
                  isPhysique ? 'members.types.physique' : 'members.types.morale',
                  isPhysique ? 'Personne physique' : 'Personne morale',
                )}
              </dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="text-muted-foreground">{t('members.table.category', 'Catégorie')}</dt>
              <dd className="ml-auto font-semibold text-primary">{getCategoryLabel(member.category, t)}</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="text-muted-foreground">{t('members.filters.region', 'Région')}</dt>
              <dd className="ml-auto font-semibold">{member.regionName ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}
