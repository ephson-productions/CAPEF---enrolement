export interface CompletenessRule {
  activityType: 'agriculteur' | 'pecheur' | 'eleveur' | 'forestier' | 'artisan';
  requiresArea: boolean; // whether area is needed (true for all 5)
  areaMustBeStrictlyPositive: boolean; // true for main crop & cultivated forestry
  hasProductRows: boolean; // true for eleveur & forestier (using products array)
}

export const COMPLETENESS_MATRIX: Record<string, CompletenessRule> = {
  agriculteur: {
    activityType: 'agriculteur',
    requiresArea: true,
    areaMustBeStrictlyPositive: true, // for principal crop
    hasProductRows: false,
  },
  pecheur: {
    activityType: 'pecheur',
    requiresArea: true,
    areaMustBeStrictlyPositive: false,
    hasProductRows: false,
  },
  eleveur: {
    activityType: 'eleveur',
    requiresArea: true,
    areaMustBeStrictlyPositive: false,
    hasProductRows: true,
  },
  forestier: {
    activityType: 'forestier',
    requiresArea: true,
    areaMustBeStrictlyPositive: false, // strictly positive only if subCategory === 'cultivé'
    hasProductRows: true,
  },
  artisan: {
    activityType: 'artisan',
    requiresArea: true,
    areaMustBeStrictlyPositive: false,
    hasProductRows: false,
  },
};

export interface ValidationError {
  field: string;
  code: 'required' | 'not_a_number' | 'negative' | 'unit_required' | 'product_required' | 'area_positive';
}

function isNumber(val: any): boolean {
  return typeof val === 'number' && !isNaN(val) && Number.isFinite(val);
}

function isNonEmptyString(val: any): boolean {
  return typeof val === 'string' && val.trim().length > 0;
}

export function validateLineItem(
  activityType: string,
  item: Record<string, any>
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Check Product / Identity
  if (activityType === 'agriculteur') {
    if (!isNonEmptyString(item.cropCategory)) {
      errors.push({ field: 'cropCategory', code: 'required' });
    }
    if (!isNonEmptyString(item.cropName)) {
      errors.push({ field: 'cropName', code: 'required' });
    }
  } else if (activityType === 'pecheur') {
    if (!isNonEmptyString(item.speciesPêche)) {
      errors.push({ field: 'speciesPêche', code: 'required' });
    }
  } else if (activityType === 'eleveur') {
    if (!isNonEmptyString(item.livestockType)) {
      errors.push({ field: 'livestockType', code: 'required' });
    }
    if (!isNonEmptyString(item.species)) {
      errors.push({ field: 'species', code: 'required' });
    }
    if (!isNumber(item.cheptelSize) || item.cheptelSize < 1) {
      errors.push({ field: 'cheptelSize', code: 'required' });
    }
  } else if (activityType === 'forestier') {
    if (!isNonEmptyString(item.subCategory)) {
      errors.push({ field: 'subCategory', code: 'required' });
    }
    if (!isNonEmptyString(item.essence)) {
      errors.push({ field: 'essence', code: 'required' });
    }
  } else if (activityType === 'artisan') {
    if (!isNonEmptyString(item.artisanatProducts)) {
      errors.push({ field: 'artisanatProducts', code: 'required' });
    }
    if (!isNonEmptyString(item.rawMaterials)) {
      errors.push({ field: 'rawMaterials', code: 'required' });
    }
  }

  // 2. Superficie (Area) - Required for all 5 categories
  const isAssociatedCrop = activityType === 'agriculteur' && (item.cultureType === 'Associée' || item.isPrincipalCrop === false);
  if (!isAssociatedCrop) {
    if (!isNumber(item.superficieHa)) {
      errors.push({ field: 'superficieHa', code: 'required' });
    } else if (item.superficieHa < 0) {
      errors.push({ field: 'superficieHa', code: 'negative' });
    } else {
      const mustBeStrictlyPositive =
        (activityType === 'agriculteur' && !isAssociatedCrop) ||
        (activityType === 'forestier' && item.subCategory === 'cultivé');
      if (mustBeStrictlyPositive && item.superficieHa <= 0) {
        errors.push({ field: 'superficieHa', code: 'area_positive' });
      }
    }
  }

  // 3. Production Quantity / Unit or Products array
  const hasProductsArray = activityType === 'eleveur' || activityType === 'forestier';
  if (hasProductsArray) {
    if (!Array.isArray(item.products) || item.products.length === 0) {
      errors.push({ field: 'products', code: 'product_required' });
    } else {
      item.products.forEach((p: any, idx: number) => {
        if (!isNonEmptyString(p.name)) {
          errors.push({ field: `products.${idx}.name`, code: 'required' });
        }
        if (!isNumber(p.quantity)) {
          errors.push({ field: `products.${idx}.quantity`, code: 'required' });
        } else if (p.quantity < 0) {
          errors.push({ field: `products.${idx}.quantity`, code: 'negative' });
        }
        if (!isNonEmptyString(p.unit)) {
          errors.push({ field: `products.${idx}.unit`, code: 'unit_required' });
        }
        if (!isNumber(p.fcfa)) {
          errors.push({ field: `products.${idx}.fcfa`, code: 'required' });
        } else if (p.fcfa < 0) {
          errors.push({ field: `products.${idx}.fcfa`, code: 'negative' });
        }
      });
    }
  } else {
    // Single quantity + unit + FCFA
    if (!isNumber(item.productionQuantity)) {
      errors.push({ field: 'productionQuantity', code: 'required' });
    } else if (item.productionQuantity < 0) {
      errors.push({ field: 'productionQuantity', code: 'negative' });
    }

    if (!isNonEmptyString(item.productionUnit)) {
      errors.push({ field: 'productionUnit', code: 'unit_required' });
    }

    if (!isNumber(item.productionFcfa)) {
      errors.push({ field: 'productionFcfa', code: 'required' });
    } else if (item.productionFcfa < 0) {
      errors.push({ field: 'productionFcfa', code: 'negative' });
    }
  }

  return errors;
}
