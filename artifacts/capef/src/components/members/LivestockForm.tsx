import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaField } from './activity-fields/AreaField';
import { ProductRowsEditor, ProductRow } from './activity-fields/ProductRowsEditor';
import { ACTIVITY_OPTIONS, OptionGroup } from '@/lib/activity-options';
import { getOptionLabel } from '@/lib/i18n-helpers';

interface LivestockFormProps {
  onPayloadChange: (payload: any | null) => void;
  errors: Record<string, string>;
}

export const LivestockForm: React.FC<LivestockFormProps> = ({
  onPayloadChange,
  errors,
}) => {
  const { t } = useTranslation();

  const [livestockType, setLivestockType] = useState('');
  const [species, setSpecies] = useState('');
  const [customSpecies, setCustomSpecies] = useState('');
  const [cheptelSize, setCheptelSize] = useState('');
  const [foodType, setFoodType] = useState('');
  const [superficieHa, setSuperficieHa] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);

  const getSpeciesGroupKey = (lType: string): OptionGroup | null => {
    const normalized = lType.trim().toLowerCase();
    switch (normalized) {
      case 'volaille': return 'species_volaille' as OptionGroup;
      case 'apiculture': return 'species_apiculture' as OptionGroup;
      case 'bovins': return 'species_bovins' as OptionGroup;
      case 'canins': return 'species_canins' as OptionGroup;
      case 'asins': return 'species_asins' as OptionGroup;
      case 'ovins': return 'species_ovins' as OptionGroup;
      case 'caprins': return 'species_caprins' as OptionGroup;
      case 'non-conventionnel': return 'species_non_conventionnel' as OptionGroup;
      default: return null;
    }
  };

  const speciesGroup = getSpeciesGroupKey(livestockType);
  const speciesOptions = speciesGroup ? ACTIVITY_OPTIONS[speciesGroup] || [] : [];

  const updateState = (updates: Partial<{
    livestockType: string;
    species: string;
    customSpecies: string;
    cheptelSize: string;
    foodType: string;
    superficieHa: string;
    products: ProductRow[];
  }>) => {
    const nextType = updates.livestockType !== undefined ? updates.livestockType : livestockType;
    const nextSpecies = updates.species !== undefined ? updates.species : species;
    const nextCustomSpecies = updates.customSpecies !== undefined ? updates.customSpecies : customSpecies;
    const nextCheptel = updates.cheptelSize !== undefined ? updates.cheptelSize : cheptelSize;
    const nextFood = updates.foodType !== undefined ? updates.foodType : foodType;
    const nextSuperficie = updates.superficieHa !== undefined ? updates.superficieHa : superficieHa;
    const nextProducts = updates.products !== undefined ? updates.products : products;

    if (updates.livestockType !== undefined) setLivestockType(updates.livestockType);
    if (updates.species !== undefined) setSpecies(updates.species);
    if (updates.customSpecies !== undefined) setCustomSpecies(updates.customSpecies);
    if (updates.cheptelSize !== undefined) setCheptelSize(updates.cheptelSize);
    if (updates.foodType !== undefined) setFoodType(updates.foodType);
    if (updates.superficieHa !== undefined) setSuperficieHa(updates.superficieHa);
    if (updates.products !== undefined) setProducts(updates.products);

    const isCustom = nextSpecies === 'Autre (préciser)';
    const finalSpecies = isCustom ? nextCustomSpecies.trim() : nextSpecies;

    const totalFcfa = nextProducts.reduce((sum, p) => sum + (p.fcfa || 0), 0);

    const payload = {
      livestockType: nextType,
      species: finalSpecies,
      cheptelSize: nextCheptel !== '' ? parseInt(nextCheptel, 10) : null,
      foodType: nextFood,
      superficieHa: nextSuperficie !== '' ? parseFloat(nextSuperficie) : null,
      products: nextProducts,
      productionFcfa: totalFcfa,
      productionQuantity: null,
      productionUnit: null,
    };

    onPayloadChange(payload);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.elevage_type', 'Type d\'élevage')} <span className="text-destructive">*</span>
          </label>
          <select
            value={livestockType}
            onChange={(e) => {
              updateState({ livestockType: e.target.value, species: '', customSpecies: '' });
            }}
            className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
              errors.livestockType ? 'border-destructive' : 'border-input'
            }`}
          >
            <option value="">{t('common.select', 'Sélectionner')}</option>
            {ACTIVITY_OPTIONS.livestock_type.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel('livestock_type', opt.value, t)}
              </option>
            ))}
          </select>
          {errors.livestockType && <p className="text-xs text-destructive mt-1">{errors.livestockType}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.species', 'Espèce élevée')} <span className="text-destructive">*</span>
          </label>
          <select
            value={species}
            disabled={!livestockType}
            onChange={(e) => updateState({ species: e.target.value })}
            className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
              errors.species ? 'border-destructive' : 'border-input'
            }`}
          >
            <option value="">{t('common.select', 'Sélectionner une espèce')}</option>
            {speciesOptions.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {speciesGroup ? getOptionLabel(speciesGroup, opt.value, t) : opt.value}
              </option>
            ))}
          </select>
          {species === 'Autre (préciser)' && (
            <input
              type="text"
              value={customSpecies}
              onChange={(e) => updateState({ customSpecies: e.target.value })}
              placeholder={t('activities.specify_species', 'Préciser l\'espèce')}
              className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm mt-2"
            />
          )}
          {errors.species && <p className="text-xs text-destructive mt-1">{errors.species}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.cheptel_size', 'Taille du cheptel (Nombre d\'animaux/têtes)')} <span className="text-destructive">*</span>
          </label>
          <input
            type="number"
            min="1"
            value={cheptelSize}
            onChange={(e) => updateState({ cheptelSize: e.target.value })}
            placeholder="Ex: 50"
            className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
              errors.cheptelSize ? 'border-destructive' : 'border-input'
            }`}
          />
          {errors.cheptelSize && <p className="text-xs text-destructive mt-1">{errors.cheptelSize}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('activities.food_type', 'Type d\'alimentation principal')}
          </label>
          <select
            value={foodType}
            onChange={(e) => updateState({ foodType: e.target.value })}
            className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
          >
            <option value="">{t('common.select', 'Sélectionner')}</option>
            {ACTIVITY_OPTIONS.feed_type.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel('feed_type', opt.value, t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <AreaField
        value={superficieHa}
        onChange={(val) => updateState({ superficieHa: val })}
        strictlyPositive={false}
        error={errors.superficieHa}
        helperText={t('activities.livestock_area_helper', 'Superficie exploitée pour l\'élevage (pâturages, enclos, bâtiments en ha). Saisir 0 si non applicable.')}
      />

      <ProductRowsEditor
        productGroup="livestock_product"
        rows={products}
        onChange={(newRows) => updateState({ products: newRows })}
        error={errors.products}
      />
    </div>
  );
};
