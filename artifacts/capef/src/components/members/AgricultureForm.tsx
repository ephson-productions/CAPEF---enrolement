import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaField } from './activity-fields/AreaField';
import { ProductionFields } from './activity-fields/ProductionFields';
import { ACTIVITY_OPTIONS, OptionGroup } from '@/lib/activity-options';
import { getOptionLabel } from '@/lib/i18n-helpers';

interface AgricultureFormProps {
  existingItems?: any[];
  onPayloadChange: (payload: any | null) => void;
  errors: Record<string, string>;
}

export const AgricultureForm: React.FC<AgricultureFormProps> = ({
  existingItems = [],
  onPayloadChange,
  errors,
}) => {
  const { t } = useTranslation();

  const [cropCategory, setCropCategory] = useState('');
  const [cropName, setCropName] = useState('');
  const [customCropName, setCustomCropName] = useState('');
  const [cultureType, setCultureType] = useState<'Pure' | 'Associée'>('Pure');
  const [parcelleGroupId, setParcelleGroupId] = useState('');
  const [parentLineItemId, setParentLineItemId] = useState<number | null>(null);

  const [superficieHa, setSuperficieHa] = useState('');
  const [prodQuantity, setProdQuantity] = useState('');
  const [prodUnit, setProdUnit] = useState('');
  const [prodFcfa, setProdFcfa] = useState('');

  const principalCrops = existingItems.filter(
    (item) => item.isPrincipalCrop !== false && item.cropName
  );

  const getCropGroupKey = (cat: string): OptionGroup | null => {
    switch (cat) {
      case 'Céréales': return 'crops_cereales' as OptionGroup;
      case 'Oléagineux': return 'crops_oleagineux' as OptionGroup;
      case 'Racines-tubercules': return 'crops_racines_tubercules' as OptionGroup;
      case 'Légumes': return 'crops_legumes' as OptionGroup;
      case 'Fruits et noix': return 'crops_fruits_noix' as OptionGroup;
      case 'Plantes stimulantes': return 'crops_plantes_stimulantes' as OptionGroup;
      case 'Légumineuses': return 'crops_legumineuses' as OptionGroup;
      case 'Cultures sucrières': return 'crops_cultures_sucrieres' as OptionGroup;
      default: return 'crops_autres' as OptionGroup;
    }
  };

  const cropGroup = getCropGroupKey(cropCategory);
  const cropOptions = cropGroup ? ACTIVITY_OPTIONS[cropGroup] || [] : [];

  const updateState = (updates: Partial<{
    cropCategory: string;
    cropName: string;
    customCropName: string;
    cultureType: 'Pure' | 'Associée';
    parcelleGroupId: string;
    parentLineItemId: number | null;
    superficieHa: string;
    prodQuantity: string;
    prodUnit: string;
    prodFcfa: string;
  }>) => {
    const nextCategory = updates.cropCategory !== undefined ? updates.cropCategory : cropCategory;
    const nextCropName = updates.cropName !== undefined ? updates.cropName : cropName;
    const nextCustomCrop = updates.customCropName !== undefined ? updates.customCropName : customCropName;
    const nextCultureType = updates.cultureType !== undefined ? updates.cultureType : cultureType;
    const nextParcelleGroup = updates.parcelleGroupId !== undefined ? updates.parcelleGroupId : parcelleGroupId;
    const nextParentItem = updates.parentLineItemId !== undefined ? updates.parentLineItemId : parentLineItemId;
    const nextSuperficie = updates.superficieHa !== undefined ? updates.superficieHa : superficieHa;
    const nextQty = updates.prodQuantity !== undefined ? updates.prodQuantity : prodQuantity;
    const nextUnit = updates.prodUnit !== undefined ? updates.prodUnit : prodUnit;
    const nextFcfa = updates.prodFcfa !== undefined ? updates.prodFcfa : prodFcfa;

    if (updates.cropCategory !== undefined) setCropCategory(updates.cropCategory);
    if (updates.cropName !== undefined) setCropName(updates.cropName);
    if (updates.customCropName !== undefined) setCustomCropName(updates.customCropName);
    if (updates.cultureType !== undefined) setCultureType(updates.cultureType);
    if (updates.parcelleGroupId !== undefined) setParcelleGroupId(updates.parcelleGroupId);
    if (updates.parentLineItemId !== undefined) setParentLineItemId(updates.parentLineItemId);
    if (updates.superficieHa !== undefined) setSuperficieHa(updates.superficieHa);
    if (updates.prodQuantity !== undefined) setProdQuantity(updates.prodQuantity);
    if (updates.prodUnit !== undefined) setProdUnit(updates.prodUnit);
    if (updates.prodFcfa !== undefined) setProdFcfa(updates.prodFcfa);

    const isAssoc = nextCultureType === 'Associée';
    const finalCropName = nextCropName === 'Autre (préciser)' ? nextCustomCrop.trim() : nextCropName;

    let finalParcelleId = nextParcelleGroup;
    if (isAssoc && nextParentItem) {
      const parentObj = existingItems.find((i) => i.id === nextParentItem);
      if (parentObj) {
        finalParcelleId = parentObj.parcelleGroupId;
      }
    } else if (!finalParcelleId) {
      finalParcelleId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'parcelle_' + Date.now();
    }

    const payload = {
      cropCategory: nextCategory,
      cropName: finalCropName,
      cultureType: nextCultureType,
      parcelleGroupId: finalParcelleId,
      isPrincipalCrop: !isAssoc,
      parentLineItemId: isAssoc ? nextParentItem : null,
      superficieHa: isAssoc ? null : (nextSuperficie !== '' ? parseFloat(nextSuperficie) : null),
      productionQuantity: nextQty !== '' ? parseFloat(nextQty) : null,
      productionUnit: nextUnit,
      productionFcfa: nextFcfa !== '' ? parseFloat(nextFcfa) : null,
    };

    onPayloadChange(payload);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.crop_category', 'Catégorie de culture')} <span className="text-destructive">*</span>
          </label>
          <select
            value={cropCategory}
            onChange={(e) => {
              updateState({ cropCategory: e.target.value, cropName: '', customCropName: '' });
            }}
            className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
              errors.cropCategory ? 'border-destructive' : 'border-input'
            }`}
          >
            <option value="">{t('common.select', 'Sélectionner')}</option>
            {ACTIVITY_OPTIONS.crop_category.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel('crop_category', opt.value, t)}
              </option>
            ))}
          </select>
          {errors.cropCategory && <p className="text-xs text-destructive mt-1">{errors.cropCategory}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.crop_name', 'Culture précise')} <span className="text-destructive">*</span>
          </label>
          <select
            value={cropName}
            disabled={!cropCategory}
            onChange={(e) => updateState({ cropName: e.target.value })}
            className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
              errors.cropName ? 'border-destructive' : 'border-input'
            }`}
          >
            <option value="">{t('common.select', 'Sélectionner une culture')}</option>
            {cropOptions.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {cropGroup ? getOptionLabel(cropGroup, opt.value, t) : opt.value}
              </option>
            ))}
          </select>
          {cropName === 'Autre (préciser)' && (
            <input
              type="text"
              value={customCropName}
              onChange={(e) => updateState({ customCropName: e.target.value })}
              placeholder={t('activities.specify_crop', 'Préciser la culture')}
              className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm mt-2"
            />
          )}
          {errors.cropName && <p className="text-xs text-destructive mt-1">{errors.cropName}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.culture_type', 'Type de culture')}
          </label>
          <select
            value={cultureType}
            onChange={(e) => {
              const newType = e.target.value as 'Pure' | 'Associée';
              updateState({ cultureType: newType });
            }}
            className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
          >
            {ACTIVITY_OPTIONS.culture_type.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel('culture_type', opt.value, t)}
              </option>
            ))}
          </select>
        </div>

        {cultureType === 'Associée' && (
          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">
              {t('activities.parent_crop_link', 'Culture principale associée (Parcelle)')}{' '}
              <span className="text-destructive">*</span>
            </label>
            <select
              value={parentLineItemId || ''}
              onChange={(e) =>
                updateState({ parentLineItemId: e.target.value ? parseInt(e.target.value, 10) : null })
              }
              className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
                errors.parentLineItemId ? 'border-destructive' : 'border-input'
              }`}
            >
              <option value="">{t('common.select', 'Sélectionner la culture principale')}</option>
              {principalCrops.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.cropName} (Superficie: {p.superficieHa || 'N/A'} ha)
                </option>
              ))}
            </select>
            {errors.parentLineItemId && (
              <p className="text-xs text-destructive mt-1">{errors.parentLineItemId}</p>
            )}
          </div>
        )}
      </div>

      {cultureType !== 'Associée' ? (
        <AreaField
          value={superficieHa}
          onChange={(val) => updateState({ superficieHa: val })}
          strictlyPositive={true}
          error={errors.superficieHa}
        />
      ) : (
        <div className="p-3 bg-muted/20 border border-border rounded-md text-xs text-muted-foreground">
          {t('activities.inherited_area_notice', 'Superficie héritée de la parcelle de la culture principale.')}
        </div>
      )}

      <ProductionFields
        quantity={prodQuantity}
        onQuantityChange={(val) => updateState({ prodQuantity: val })}
        unit={prodUnit}
        onUnitChange={(val) => updateState({ prodUnit: val })}
        fcfa={prodFcfa}
        onFcfaChange={(val) => updateState({ prodFcfa: val })}
        errors={errors}
      />
    </div>
  );
};
