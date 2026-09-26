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
  const unitLabel = activityType === 'artisan' ? 'm²' : t('activities.unit_ha', 'ha');

  const areaStr = item.parentLineItemId || item.cultureType === 'Associée'
    ? `${t('activities.superficie_short', 'Superficie:')} ${t('activities.inherited_area', 'Superficie héritée')}`
    : item.superficieHa !== null && item.superficieHa !== undefined
      ? `${t('activities.superficie_short', 'Superficie:')} ${item.superficieHa} ${unitLabel}`
      : `${t('activities.superficie_short', 'Superficie:')} —`;
  const productsStr = Array.isArray(item.products) && item.products.length > 0
    ? item.products
      .map((product: any) => `${product.name}: ${product.quantity ?? '—'} ${product.unit || ''}`.trim())
      .join('; ')
    : '';

  if (activityType === 'agriculteur') {
    const typeLabel = item.cultureType ? getOptionLabel('culture_type', item.cultureType, t) : '—';
    return `${areaStr}, ${t('activities.culture_type_short', 'Type:')} ${typeLabel}`;
  }

  if (activityType === 'eleveur') {
    const cheptelStr = item.cheptelSize !== null && item.cheptelSize !== undefined ? item.cheptelSize : '—';
    const foodLabel = item.foodType ? getOptionLabel('feed_type', item.foodType, t) : '—';
    return `${areaStr}, ${t('activities.cheptel_short', 'Cheptel:')} ${cheptelStr}, ${t('activities.food_short', 'Nourriture:')} ${foodLabel}${productsStr ? `, ${t('activities.products_short', 'Produits:')} ${productsStr}` : ''}`;
  }

  if (activityType === 'forestier') {
    const productsSuffix = productsStr ? `, ${t('activities.products_short', 'Produits:')} ${productsStr}` : '';
    if (item.subCategory === 'cultivé') {
      const plantLabel = item.plantationType ? getOptionLabel('plantation_type', item.plantationType, t) : '—';
      return `${areaStr}, ${t('activities.plantation_type_short', 'Plantation:')} ${plantLabel}${productsSuffix}`;
    }
    return `${areaStr}${productsSuffix}`;
  }

  if (activityType === 'artisan') {
    const rawTokens = item.rawMaterials
      ? item.rawMaterials.split(';').map((tok: string) => getOptionLabel('raw_materials', tok.trim(), t)).join(', ')
      : '—';
    return `${areaStr}, ${t('activities.raw_mat_short', 'Matières:')} ${rawTokens}`;
  }

  return areaStr;
}
