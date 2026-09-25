import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTIVITY_OPTIONS } from '@/lib/activity-options';
import { getOptionLabel } from '@/lib/i18n-helpers';

interface ProductionFieldsProps {
  quantity: string | number;
  onQuantityChange: (val: string) => void;
  unit: string;
  onUnitChange: (val: string) => void;
  fcfa: string | number;
  onFcfaChange: (val: string) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

export const ProductionFields: React.FC<ProductionFieldsProps> = ({
  quantity,
  onQuantityChange,
  unit,
  onUnitChange,
  fcfa,
  onFcfaChange,
  errors = {},
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [customUnit, setCustomUnit] = useState('');

  const unitOptions = ACTIVITY_OPTIONS.production_units;
  const isCustom = !unitOptions.some((opt) => opt.value === unit) && unit !== '';

  const handleSelectUnit = (selected: string) => {
    if (selected === 'Autre (préciser)') {
      onUnitChange(customUnit || 'Autre');
    } else {
      onUnitChange(selected);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border pt-4 mt-2">
      <div>
        <label className="block text-sm font-medium mb-1 text-foreground">
          {t('activities.prod_quantity', 'Production annuelle (Quantité)')} <span className="text-destructive">*</span>
        </label>
        <input
          type="number"
          step="any"
          min="0"
          value={quantity ?? ''}
          onChange={(e) => onQuantityChange(e.target.value)}
          disabled={disabled}
          placeholder={t('activities.hint_zero_if_na', 'Saisir 0 si non applicable')}
          className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
            errors.productionQuantity ? 'border-destructive' : 'border-input'
          }`}
        />
        {errors.productionQuantity && (
          <p className="text-xs text-destructive mt-1 font-medium">{errors.productionQuantity}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-foreground">
          {t('activities.prod_unit', 'Unité de mesure')} <span className="text-destructive">*</span>
        </label>
        <select
          value={isCustom ? 'Autre (préciser)' : unit}
          onChange={(e) => handleSelectUnit(e.target.value)}
          disabled={disabled}
          className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
            errors.productionUnit ? 'border-destructive' : 'border-input'
          }`}
        >
          <option value="">{t('common.select', 'Sélectionner une unité')}</option>
          {unitOptions.map((opt) => (
            <option key={opt.key} value={opt.value}>
              {getOptionLabel('production_units', opt.value, t)}
            </option>
          ))}
        </select>
        {(isCustom || unit === 'Autre (préciser)') && (
          <input
            type="text"
            value={isCustom ? unit : customUnit}
            onChange={(e) => {
              setCustomUnit(e.target.value);
              onUnitChange(e.target.value);
            }}
            placeholder={t('activities.custom_unit_placeholder', 'Préciser l\'unité')}
            className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm mt-2"
          />
        )}
        {errors.productionUnit && (
          <p className="text-xs text-destructive mt-1 font-medium">{errors.productionUnit}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-foreground">
          {t('activities.prod_fcfa', 'Valeur (FCFA)')} <span className="text-destructive">*</span>
        </label>
        <input
          type="number"
          step="any"
          min="0"
          value={fcfa ?? ''}
          onChange={(e) => onFcfaChange(e.target.value)}
          disabled={disabled}
          placeholder={t('activities.hint_zero_if_na', 'Saisir 0 si non applicable')}
          className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
            errors.productionFcfa ? 'border-destructive' : 'border-input'
          }`}
        />
        {errors.productionFcfa && (
          <p className="text-xs text-destructive mt-1 font-medium">{errors.productionFcfa}</p>
        )}
      </div>
    </div>
  );
};
