import type { TFunction } from 'i18next';

export function getCategoryLabel(category: string | undefined | null, t: TFunction): string {
  if (!category) return t('common.not_defined', 'Non défini');
  const normalized = category.toLowerCase().trim();
  switch (normalized) {
    case 'agriculteur':
    case 'agriculture':
      return t('members.categories.agriculteur', 'Agriculteur');
    case 'pecheur':
    case 'peche':
    case 'pêcheur':
      return t('members.categories.pecheur', 'Pêcheur / Aquaculteur');
    case 'eleveur':
    case 'elevage':
    case 'éleveur':
      return t('members.categories.eleveur', 'Éleveur');
    case 'forestier':
    case 'foret':
      return t('members.categories.forestier', 'Exploitant Forestier');
    case 'artisan':
    case 'artisanat':
      return t('members.categories.artisan', 'Artisan');
    default:
      return category;
  }
}

export function getStatusLabel(status: string | undefined | null, t: TFunction): string {
  if (!status) return t('common.not_defined', 'Non défini');
  const normalized = status.toLowerCase().trim();
  switch (normalized) {
    case 'incomplet':
      return t('members.status.incomplet', 'Incomplet');
    case 'en_attente':
      return t('members.status.en_attente', 'En attente');
    case 'valide':
      return t('members.status.valide', 'Validé');
    case 'desactive':
      return t('members.status.desactive', 'Désactivé');
    case 'bloque':
      return t('members.status.bloque', 'Bloqué');
    default:
      return status;
  }
}
