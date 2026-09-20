import type { TFunction } from 'i18next';
import { ACTIVITY_OPTIONS, OptionGroup } from './activity-options';

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

export function normalizeOptionValue(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getOptionLabel(
  group: OptionGroup,
  storedValue: string | undefined | null,
  t: TFunction
): string {
  if (!storedValue) return storedValue as any;

  const options = ACTIVITY_OPTIONS[group];
  if (!options) return storedValue;

  const normalizedInput = normalizeOptionValue(storedValue);
  const found = options.find((opt) => normalizeOptionValue(opt.value) === normalizedInput);

  if (found) {
    const translationKey = `activities.options.${group}.${found.key}`;
    const translated = t(translationKey);
    // If translation key is returned as fallback or empty, fallback to storedValue
    if (translated && translated !== translationKey) {
      return translated;
    }
  }

  return storedValue;
}

export function getMaillonLabel(
  activityType: string | undefined | null,
  storedValue: string | undefined | null,
  t: TFunction
): string {
  if (!activityType || !storedValue) return storedValue || '';
  const group = `maillons_${activityType}` as OptionGroup;
  return getOptionLabel(group, storedValue, t);
}

export function formatLineItemTitle(
  item: any,
  activityType: string | undefined | null,
  t: TFunction
): string {
  if (!item) return '';

  if (activityType === 'agriculteur') {
    const categoryLabel = item.cropCategory ? getOptionLabel('crop_category', item.cropCategory, t) : '';
    const cropName = item.cropName || '';
    if (categoryLabel && cropName) return `${categoryLabel} - ${cropName}`;
    return categoryLabel || cropName || '';
  }

  if (activityType === 'pecheur') {
    return item.speciesPêche ? getOptionLabel('fish_species', item.speciesPêche, t) : (item.speciesPêche || '');
  }

  if (activityType === 'eleveur') {
    return item.species || '';
  }

  if (activityType === 'forestier') {
    const subLabel = item.subCategory ? getOptionLabel('forestry_subcategory', item.subCategory, t) : '';
    const essence = item.essence || '';
    if (subLabel && essence) return `${subLabel} - ${essence}`;
    return subLabel || essence || '';
  }

  if (activityType === 'artisan') {
    return item.artisanatProducts ? getOptionLabel('artisan_product', item.artisanatProducts, t) : (item.artisanatProducts || '');
  }

  return '';
}

export function formatLineItemSpecifics(
  item: any,
  activityType: string | undefined | null,
  t: TFunction
): string {
  if (!item) return '';
  const notAvail = t('common.not_available', 'N/A');

  if (activityType === 'agriculteur') {
    const typeLabel = item.cultureType ? getOptionLabel('culture_type', item.cultureType, t) : '';
    const typeStr = `${t('activities.culture_type_short', 'Type:')} ${typeLabel || notAvail}`;
    const supStr = `${t('activities.superficie_short', 'Superficie:')} ${item.superficieHa || notAvail} ${t('activities.unit_ha', 'ha')}`;
    return `${typeStr}, ${supStr}`;
  }

  if (activityType === 'eleveur') {
    const cheptelStr = `${t('activities.cheptel_short', 'Cheptel:')} ${item.cheptelSize || notAvail}`;
    const foodLabel = item.foodType ? getOptionLabel('feed_type', item.foodType, t) : notAvail;
    const foodStr = `${t('activities.food_short', 'Nourriture:')} ${foodLabel}`;
    return `${cheptelStr}, ${foodStr}`;
  }

  if (activityType === 'forestier') {
    const plantLabel = item.plantationType ? getOptionLabel('plantation_type', item.plantationType, t) : notAvail;
    const plantStr = `${t('activities.plantation_type_short', 'Plantation:')} ${plantLabel}`;
    const supStr = `${t('activities.superficie_short', 'Superficie:')} ${item.superficieHa || notAvail} ${t('activities.unit_ha', 'ha')}`;
    return `${plantStr}, ${supStr}`;
  }

  if (activityType === 'artisan') {
    return `${t('activities.raw_mat_short', 'Matières:')} ${item.rawMaterials || ''}`;
  }

  return '';
}
