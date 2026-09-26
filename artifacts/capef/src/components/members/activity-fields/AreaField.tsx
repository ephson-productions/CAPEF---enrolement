import React from 'react';
import { useTranslation } from 'react-i18next';

interface AreaFieldProps {
  value: string | number;
  onChange: (val: string) => void;
  required?: boolean;
  strictlyPositive?: boolean;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  unitLabel?: string;
  labelKey?: string;
  labelFallback?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

export const AreaField: React.FC<AreaFieldProps> = ({
  value,
  onChange,
  required = true,
  disabled = false,
  error,
  helperText,
  unitLabel = 'ha',
  labelKey,
  labelFallback,
  inputRef,
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-foreground">
        {labelKey
          ? t(labelKey, labelFallback || labelKey)
          : unitLabel === 'm²'
            ? t('activities.craft.area_label', 'Superficie / espace de production (m²)')
            : t('activities.superficie', 'Superficie de la parcelle / site (ha)')}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        ref={inputRef}
        disabled={disabled}
        placeholder={t('activities.hint_zero_if_na', 'Saisir 0 si non applicable')}
        className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${
          error ? 'border-destructive focus:ring-destructive' : 'border-input'
        }`}
      />
      {helperText && <p className="text-xs text-muted-foreground mt-1">{helperText}</p>}
      {error && <p className="text-xs text-destructive mt-1 font-medium">{error}</p>}
    </div>
  );
};
