import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaField } from './activity-fields/AreaField';
import { ProductionFields } from './activity-fields/ProductionFields';
import { ACTIVITY_OPTIONS } from '@/lib/activity-options';
import { getOptionLabel } from '@/lib/i18n-helpers';

interface CraftFormProps {
  onPayloadChange: (payload: any | null) => void;
  errors: Record<string, string>;
}

export const CraftForm: React.FC<CraftFormProps> = ({
  onPayloadChange,
  errors,
}) => {
  const { t } = useTranslation();

  const [artisanatProducts, setArtisanatProducts] = useState('');
  const [customArtisanatProduct, setCustomArtisanatProduct] = useState('');
  const [selectedRawMaterials, setSelectedRawMaterials] = useState<string[]>([]);
  const [customRawMaterial, setCustomRawMaterial] = useState('');

  const [superficieHa, setSuperficieHa] = useState('');
  const [prodQuantity, setProdQuantity] = useState('');
  const [prodUnit, setProdUnit] = useState('');
  const [prodFcfa, setProdFcfa] = useState('');

  const rawMaterialOptions = ACTIVITY_OPTIONS.raw_materials;

  const updateState = (updates: Partial<{
    artisanatProducts: string;
    customArtisanatProduct: string;
    selectedRawMaterials: string[];
    customRawMaterial: string;
    superficieHa: string;
    prodQuantity: string;
    prodUnit: string;
    prodFcfa: string;
  }>) => {
    const nextProduct = updates.artisanatProducts !== undefined ? updates.artisanatProducts : artisanatProducts;
    const nextCustomProduct = updates.customArtisanatProduct !== undefined ? updates.customArtisanatProduct : customArtisanatProduct;
    const nextMaterials = updates.selectedRawMaterials !== undefined ? updates.selectedRawMaterials : selectedRawMaterials;
    const nextCustomMat = updates.customRawMaterial !== undefined ? updates.customRawMaterial : customRawMaterial;
    const nextSuperficie = updates.superficieHa !== undefined ? updates.superficieHa : superficieHa;
    const nextQty = updates.prodQuantity !== undefined ? updates.prodQuantity : prodQuantity;
    const nextUnit = updates.prodUnit !== undefined ? updates.prodUnit : prodUnit;
    const nextFcfa = updates.prodFcfa !== undefined ? updates.prodFcfa : prodFcfa;

    if (updates.artisanatProducts !== undefined) setArtisanatProducts(updates.artisanatProducts);
    if (updates.customArtisanatProduct !== undefined) setCustomArtisanatProduct(updates.customArtisanatProduct);
    if (updates.selectedRawMaterials !== undefined) setSelectedRawMaterials(updates.selectedRawMaterials);
    if (updates.customRawMaterial !== undefined) setCustomRawMaterial(updates.customRawMaterial);
    if (updates.superficieHa !== undefined) setSuperficieHa(updates.superficieHa);
    if (updates.prodQuantity !== undefined) setProdQuantity(updates.prodQuantity);
    if (updates.prodUnit !== undefined) setProdUnit(updates.prodUnit);
    if (updates.prodFcfa !== undefined) setProdFcfa(updates.prodFcfa);

    const isCustomProduct = nextProduct === 'Autres' || nextProduct === 'Autre (préciser)';
    const finalProduct = isCustomProduct ? nextCustomProduct.trim() : nextProduct;

    // Process raw materials as semicolon-separated string
    const processedMaterials = nextMaterials.map((mat) => {
      if (mat === 'Autres (préciser)') {
        return nextCustomMat.replace(/;/g, '').trim();
      }
      return mat.replace(/;/g, '');
    }).filter(Boolean);

    const finalRawMaterials = processedMaterials.join('; ');

    const payload = {
      artisanatProducts: finalProduct,
      rawMaterials: finalRawMaterials,
      superficieHa: nextSuperficie !== '' ? parseFloat(nextSuperficie) : null,
      productionQuantity: nextQty !== '' ? parseFloat(nextQty) : null,
      productionUnit: nextUnit,
      productionFcfa: nextFcfa !== '' ? parseFloat(nextFcfa) : null,
    };

    onPayloadChange(payload);
  };

  const handleMaterialToggle = (matValue: string, checked: boolean) => {
    let nextList: string[];
    if (checked) {
      nextList = [...selectedRawMaterials, matValue];
    } else {
      nextList = selectedRawMaterials.filter((m) => m !== matValue);
    }
    updateState({ selectedRawMaterials: nextList });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.artisan_products', 'Produit d\'artisanat')} <span className="text-destructive">*</span>
          </label>
          <select
            value={artisanatProducts}
            onChange={(e) => updateState({ artisanatProducts: e.target.value })}
            className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
              errors.artisanatProducts ? 'border-destructive' : 'border-input'
            }`}
          >
            <option value="">{t('common.select', 'Sélectionner')}</option>
            {ACTIVITY_OPTIONS.artisan_product.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel('artisan_product', opt.value, t)}
              </option>
            ))}
          </select>
          {(artisanatProducts === 'Autres' || artisanatProducts === 'Autre (préciser)') && (
            <input
              type="text"
              value={customArtisanatProduct}
              onChange={(e) => updateState({ customArtisanatProduct: e.target.value })}
              placeholder={t('activities.specify_artisan_product', 'Préciser le produit')}
              className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm mt-2"
            />
          )}
          {errors.artisanatProducts && <p className="text-xs text-destructive mt-1">{errors.artisanatProducts}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.raw_mat', 'Matières premières utilisées')} <span className="text-destructive">*</span>
          </label>
          <div className="border border-border p-3 rounded-md bg-muted/20 space-y-2">
            {rawMaterialOptions.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedRawMaterials.includes(opt.value)}
                  onChange={(e) => handleMaterialToggle(opt.value, e.target.checked)}
                />
                {getOptionLabel('raw_materials', opt.value, t)}
              </label>
            ))}
            {selectedRawMaterials.includes('Autres (préciser)') && (
              <input
                type="text"
                value={customRawMaterial}
                onChange={(e) => updateState({ customRawMaterial: e.target.value })}
                placeholder={t('activities.specify_raw_material', 'Préciser les matières premières')}
                className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm mt-1"
              />
            )}
          </div>
          {errors.rawMaterials && <p className="text-xs text-destructive mt-1">{errors.rawMaterials}</p>}
        </div>
      </div>

      <AreaField
        value={superficieHa}
        onChange={(val) => updateState({ superficieHa: val })}
        unitLabel="m²"
        strictlyPositive={false}
        error={errors.superficieHa}
        helperText={t('activities.craft_area_helper', 'Superficie du site de production/atelier en m². Saisir 0 si non applicable.')}
      />

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
