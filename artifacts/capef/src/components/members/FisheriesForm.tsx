import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaField } from './activity-fields/AreaField';
import { ProductionFields } from './activity-fields/ProductionFields';
import { ACTIVITY_OPTIONS } from '@/lib/activity-options';
import { getOptionLabel } from '@/lib/i18n-helpers';

interface FisheriesFormProps {
  onPayloadChange: (payload: any | null) => void;
  errors: Record<string, string>;
}

export const FisheriesForm: React.FC<FisheriesFormProps> = ({
  onPayloadChange,
  errors,
}) => {
  const { t } = useTranslation();

  const [speciesPêche, setSpeciesPêche] = useState('');
  const [customSpecies, setCustomSpecies] = useState('');
  const [superficieHa, setSuperficieHa] = useState('');
  const [prodQuantity, setProdQuantity] = useState('');
  const [prodUnit, setProdUnit] = useState('');
  const [prodFcfa, setProdFcfa] = useState('');

  const updateState = (updates: Partial<{
    speciesPêche: string;
    customSpecies: string;
    superficieHa: string;
    prodQuantity: string;
    prodUnit: string;
    prodFcfa: string;
  }>) => {
    const nextSpecies = updates.speciesPêche !== undefined ? updates.speciesPêche : speciesPêche;
    const nextCustom = updates.customSpecies !== undefined ? updates.customSpecies : customSpecies;
    const nextSuperficie = updates.superficieHa !== undefined ? updates.superficieHa : superficieHa;
    const nextQty = updates.prodQuantity !== undefined ? updates.prodQuantity : prodQuantity;
    const nextUnit = updates.prodUnit !== undefined ? updates.prodUnit : prodUnit;
    const nextFcfa = updates.prodFcfa !== undefined ? updates.prodFcfa : prodFcfa;

    if (updates.speciesPêche !== undefined) setSpeciesPêche(updates.speciesPêche);
    if (updates.customSpecies !== undefined) setCustomSpecies(updates.customSpecies);
    if (updates.superficieHa !== undefined) setSuperficieHa(updates.superficieHa);
    if (updates.prodQuantity !== undefined) setProdQuantity(updates.prodQuantity);
    if (updates.prodUnit !== undefined) setProdUnit(updates.prodUnit);
    if (updates.prodFcfa !== undefined) setProdFcfa(updates.prodFcfa);

    const finalSpecies = nextSpecies === 'Autres' ? nextCustom.trim() : nextSpecies;

    const payload = {
      speciesPêche: finalSpecies,
      superficieHa: nextSuperficie !== '' ? parseFloat(nextSuperficie) : null,
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
            {t('activities.pesce_species', 'Espèce / Produit de pêche principal')} <span className="text-destructive">*</span>
          </label>
          <select
            value={speciesPêche}
            onChange={(e) => updateState({ speciesPêche: e.target.value })}
            className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
              errors.speciesPêche ? 'border-destructive' : 'border-input'
            }`}
          >
            <option value="">{t('common.select', 'Sélectionner')}</option>
            {ACTIVITY_OPTIONS.fish_species.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel('fish_species', opt.value, t)}
              </option>
            ))}
          </select>
          {speciesPêche === 'Autres' && (
            <input
              type="text"
              value={customSpecies}
              onChange={(e) => updateState({ customSpecies: e.target.value })}
              placeholder={t('activities.specify_species', 'Préciser l\'espèce')}
              className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm mt-2"
            />
          )}
          {errors.speciesPêche && <p className="text-xs text-destructive mt-1">{errors.speciesPêche}</p>}
        </div>
      </div>

      <AreaField
        value={superficieHa}
        onChange={(val) => updateState({ superficieHa: val })}
        strictlyPositive={false}
        error={errors.superficieHa}
        helperText={t('activities.fisheries_area_helper', 'Saisir la superficie du site d\'aquaculture en ha (0 si pêche en milieu naturel).')}
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
