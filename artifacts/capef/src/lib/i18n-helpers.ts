import type { TFunction } from 'i18next';

const CATEGORY_KEY_MAP: Record<string, string> = {
  agriculteur: 'agriculture',
  agriculture: 'agriculture',
  pecheur: 'peche',
  pêcheur: 'peche',
  peche: 'peche',
  pêche: 'peche',
  eleveur: 'elevage',
  éleveur: 'elevage',
  elevage: 'elevage',
  élevage: 'elevage',
  forestier: 'foret',
  foret: 'foret',
  forêt: 'foret',
  artisan: 'artisanat',
  artisanat: 'artisanat',
};

const STATUS_KEY_MAP: Record<string, string> = {
  incomplet: 'incomplete',
  incomplete: 'incomplete',
  en_attente: 'pending',
  pending: 'pending',
  valide: 'valid',
  validé: 'valid',
  valid: 'valid',
  desactive: 'deactivated',
  désactivé: 'deactivated',
  deactivated: 'deactivated',
  bloque: 'blocked',
  bloqué: 'blocked',
  blocked: 'blocked',
};

export function getCategoryLabel(category: string | undefined | null, t: TFunction): string {
  if (!category) return category || '';
  const normalized = category.toLowerCase().trim();
  const key = CATEGORY_KEY_MAP[normalized];
  return key ? t(`members.categories.${key}`) : category;
}

export function getStatusLabel(status: string | undefined | null, t: TFunction): string {
  if (!status) return status || '';
  const normalized = status.toLowerCase().trim();
  const key = STATUS_KEY_MAP[normalized];
  return key ? t(`members.status.${key}`) : status;
}
