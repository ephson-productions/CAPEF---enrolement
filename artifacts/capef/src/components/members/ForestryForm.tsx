import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaField } from './activity-fields/AreaField';
import { ProductRowsEditor, ProductRow } from './activity-fields/ProductRowsEditor';
import { ACTIVITY_OPTIONS, OptionGroup } from '@/lib/activity-options';
import { getOptionLabel } from '@/lib/i18n-helpers';

interface ForestryFormProps {
  onPayloadChange: (payload: any | null) => void;
  errors: Record<string, string>;
}

export const ForestryForm: React.FC<ForestryFormProps> = ({
  onPayloadChange,
  errors,
}) => {
  const { t } = useTranslation();

  const [subCategory, setSubCategory] = useState<'exploité' | 'cultivé' | 'faune' | 'non-ligneux'>('exploité');
  const [essence, setEssence] = useState('');
  const [customEssence, setCustomEssence] = useState('');
  const [plantationType, setPlantationType] = useState('Monospécifique');
  const [superficieHa, setSuperficieHa] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);

  const getEssenceGroupKey = (subCat: string): OptionGroup | null => {
    switch (subCat) {
      case 'exploité': return 'essence_exploite' as OptionGroup;
      case 'cultivé': return 'essence_cultive' as OptionGroup;
      case 'non-ligneux': return 'essence_non_ligneux' as OptionGroup;
      default: return null;
    }
  };

  const essenceGroup = getEssenceGroupKey(subCategory);
  const essenceOptions = essenceGroup ? ACTIVITY_OPTIONS[essenceGroup] || [] : [];

  const updateState = (updates: Partial<{
    subCategory: 'exploité' | 'cultivé' | 'faune' | 'non-ligneux';
    essence: string;
    customEssence: string;
    plantationType: string;
    superficieHa: string;
    products: ProductRow[];
  }>) => {
    const nextSub = updates.subCategory !== undefined ? updates.subCategory : subCategory;
    const nextEssence = updates.essence !== undefined ? updates.essence : essence;
    const nextCustomEssence = updates.customEssence !== undefined ? updates.customEssence : customEssence;
    const nextPlantation = updates.plantationType !== undefined ? updates.plantationType : plantationType;
    const nextSuperficie = updates.superficieHa !== undefined ? updates.superficieHa : superficieHa;
    const nextProducts = updates.products !== undefined ? updates.products : products;

    if (updates.subCategory !== undefined) setSubCategory(updates.subCategory);
    if (updates.essence !== undefined) setEssence(updates.essence);
    if (updates.customEssence !== undefined) setCustomEssence(updates.customEssence);
    if (updates.plantationType !== undefined) setPlantationType(updates.plantationType);
    if (updates.superficieHa !== undefined) setSuperficieHa(updates.superficieHa);
    if (updates.products !== undefined) setProducts(updates.products);

    const isCustom = nextEssence === 'Autre (préciser)';
    const finalEssence = isCustom ? nextCustomEssence.trim() : nextEssence;

    const totalFcfa = nextProducts.reduce((sum, p) => sum + (p.fcfa || 0), 0);

    const normNextSub = normSubCategory(nextSub);
    const isCultivated = normNextSub === 'cultivé' || normNextSub === 'cultive';

    const payload = {
      subCategory: nextSub,
      essence: finalEssence,
      plantationType: isCultivated ? nextPlantation : null,
      superficieHa: nextSuperficie !== '' ? parseFloat(nextSuperficie) : null,
      products: nextProducts,
      productionFcfa: totalFcfa,
      productionQuantity: null,
      productionUnit: null,
    };

    onPayloadChange(payload);
  };

  const currentNormSub = normSubCategory(subCategory);
  const isFauna = currentNormSub === 'faune';
  const isCultivated = currentNormSub === 'cultivé' || currentNormSub === 'cultive';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.foret_sub', 'Sous-catégorie d\'exploitation')} <span className="text-destructive">*</span>
          </label>
          <select
            value={subCategory}
            onChange={(e) => {
              const newSub = e.target.value as any;
              updateState({ subCategory: newSub, essence: '', customEssence: '' });
            }}
            className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
          >
            {ACTIVITY_OPTIONS.forestry_subcategory.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel('forestry_subcategory', opt.value, t)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.essence', 'Essence forestière / Espèce')} <span className="text-destructive">*</span>
          </label>
          {isFauna ? (
            <input
              type="text"
              value={essence}
              onChange={(e) => updateState({ essence: e.target.value })}
              placeholder={t('activities.specify_fauna_species', 'Ex: Gibier, Céphalophe...')}
              className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
                errors.essence ? 'border-destructive' : 'border-input'
              }`}
            />
          ) : (
            <>
              <select
                value={essence}
                onChange={(e) => updateState({ essence: e.target.value })}
                className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
                  errors.essence ? 'border-destructive' : 'border-input'
                }`}
              >
                <option value="">{t('common.select', 'Sélectionner une essence')}</option>
                {essenceOptions.map((opt) => (
                  <option key={opt.key} value={opt.value}>
                    {essenceGroup ? getOptionLabel(essenceGroup, opt.value, t) : opt.value}
                  </option>
                ))}
              </select>
              {essence === 'Autre (préciser)' && (
                <input
                  type="text"
                  value={customEssence}
                  onChange={(e) => updateState({ customEssence: e.target.value })}
                  placeholder={t('activities.specify_essence', 'Préciser l\'essence')}
                  className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm mt-2"
                />
              )}
            </>
          )}
          {errors.essence && <p className="text-xs text-destructive mt-1">{errors.essence}</p>}
        </div>

        {isCultivated && (
          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">
              {t('activities.plantation_type', 'Type de plantation')}
            </label>
            <select
              value={plantationType}
              onChange={(e) => updateState({ plantationType: e.target.value })}
              className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
            >
              {ACTIVITY_OPTIONS.plantation_type.map((opt) => (
                <option key={opt.key} value={opt.value}>
                  {getOptionLabel('plantation_type', opt.value, t)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <AreaField
        value={superficieHa}
        onChange={(val) => updateState({ superficieHa: val })}
        strictlyPositive={isCultivated}
        error={errors.superficieHa}
        helperText={
          isCultivated
            ? t('activities.cultivated_forest_area_helper', 'Superficie cultivée obligatoire (> 0 ha).')
            : t('activities.forest_area_helper', 'Superficie exploitée en ha (saisir 0 si non applicable).')
        }
      />

      <ProductRowsEditor
        productGroup="forestry_product"
        rows={products}
        onChange={(newRows) => updateState({ products: newRows })}
        error={errors.products}
      />
    </div>
  );
};
