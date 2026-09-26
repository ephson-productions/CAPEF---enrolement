import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTIVITY_OPTIONS, ActivityOption, OptionGroup } from '@/lib/activity-options';
import { getOptionLabel } from '@/lib/i18n-helpers';
import { Plus, Trash2 } from 'lucide-react';

export interface ProductRow {
  name: string;
  quantity: number;
  unit: string;
  fcfa: number;
}

interface ProductRowsEditorProps {
  productGroup: OptionGroup; // livestock_product or forestry_product
  rows: ProductRow[];
  onChange: (rows: ProductRow[]) => void;
  error?: string;
  disabled?: boolean;
  unitOptions?: readonly ActivityOption[];
}

export const ProductRowsEditor: React.FC<ProductRowsEditorProps> = ({
  productGroup,
  rows,
  onChange,
  error,
  disabled = false,
  unitOptions: unitOptionsProp,
}) => {
  const { t } = useTranslation();

  const [selectedProduct, setSelectedProduct] = useState('');
  const [customProduct, setCustomProduct] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [fcfa, setFcfa] = useState('');
  const [rowError, setRowError] = useState('');

  const productOptions = ACTIVITY_OPTIONS[productGroup] || [];
  const unitOptions = unitOptionsProp || ACTIVITY_OPTIONS.production_units;

  const handleAdd = () => {
    setRowError('');
    const finalName = selectedProduct === 'Autres (préciser)' || selectedProduct === 'Autre (préciser)'
      ? customProduct.trim()
      : selectedProduct;

    const finalUnit = unit === 'Autre (préciser)' ? customUnit.trim() : unit;

    if (!finalName) {
      setRowError(t('activities.validation.product_required', 'Le nom du produit est requis'));
      return;
    }

    const numQty = qty !== '' ? parseFloat(qty) : NaN;
    if (isNaN(numQty) || numQty < 0) {
      setRowError(t('activities.validation.required', 'Quantité valide requise (≥ 0)'));
      return;
    }

    if (!finalUnit) {
      setRowError(t('activities.validation.unit_required', 'Unité de mesure requise'));
      return;
    }

    const numFcfa = fcfa !== '' ? parseFloat(fcfa) : NaN;
    if (isNaN(numFcfa) || numFcfa < 0) {
      setRowError(t('activities.validation.required', 'Valeur FCFA valide requise (≥ 0)'));
      return;
    }

    onChange([...rows, { name: finalName, quantity: numQty, unit: finalUnit, fcfa: numFcfa }]);

    // Reset row form
    setSelectedProduct('');
    setCustomProduct('');
    setQty('');
    setUnit('');
    setCustomUnit('');
    setFcfa('');
  };

  const handleRemove = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="border border-border p-4 rounded-md bg-muted/10 space-y-4">
      <div className="flex justify-between items-center border-b pb-2">
        <h4 className="font-semibold text-sm text-foreground">
          {t('activities.products_obtained', 'Produits obtenus')} <span className="text-destructive">*</span>
        </h4>
        <span className="text-xs text-muted-foreground">{t('activities.at_least_one_product', 'Au moins 1 produit requis')}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">{t('activities.product_name', 'Produit')}</label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            disabled={disabled}
            className="w-full border border-input rounded p-1.5 text-sm bg-background text-foreground"
          >
            <option value="">{t('common.select', 'Sélectionner')}</option>
            {productOptions.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel(productGroup, opt.value, t)}
              </option>
            ))}
          </select>
          {(selectedProduct === 'Autres (préciser)' || selectedProduct === 'Autre (préciser)') && (
            <input
              type="text"
              value={customProduct}
              onChange={(e) => setCustomProduct(e.target.value)}
              placeholder={t('activities.specify_product', 'Préciser le produit')}
              className="w-full border border-input rounded p-1.5 text-sm bg-background text-foreground mt-1"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">{t('activities.quantity', 'Quantité')}</label>
          <input
            type="number"
            step="any"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Ex: 10"
            disabled={disabled}
            className="w-full border border-input rounded p-1.5 text-sm bg-background text-foreground"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">{t('activities.prod_unit', 'Unité')}</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            disabled={disabled}
            className="w-full border border-input rounded p-1.5 text-sm bg-background text-foreground"
          >
            <option value="">{t('common.select', 'Unité')}</option>
              {unitOptions.map((opt) => (
              <option key={opt.key} value={opt.value}>
                {getOptionLabel('production_units', opt.value, t)}
              </option>
            ))}
          </select>
          {unit === 'Autre (préciser)' && (
            <input
              type="text"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              placeholder={t('activities.specify_unit', 'Préciser')}
              className="w-full border border-input rounded p-1.5 text-sm bg-background text-foreground mt-1"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">{t('activities.value_fcfa', 'Valeur (FCFA)')}</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              min="0"
              value={fcfa}
              onChange={(e) => setFcfa(e.target.value)}
              placeholder="Ex: 50000"
              disabled={disabled}
              className="w-full border border-input rounded p-1.5 text-sm bg-background text-foreground"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={disabled}
              className="bg-secondary text-secondary-foreground font-semibold px-3 py-1.5 text-xs rounded hover:bg-secondary/90 shrink-0 flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('common.add', 'Ajouter')}
            </button>
          </div>
        </div>
      </div>

      {rowError && <p className="text-xs text-destructive font-medium">{rowError}</p>}

      {rows.length > 0 && (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted text-muted-foreground font-semibold">
              <tr>
                <th className="p-2">{t('activities.product_name', 'Produit')}</th>
                <th className="p-2">{t('activities.quantity', 'Quantité')}</th>
                <th className="p-2">{t('activities.prod_unit', 'Unité')}</th>
                <th className="p-2 text-right">{t('activities.value_fcfa', 'FCFA')}</th>
                <th className="p-2 text-right">{t('common.action', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-muted/10">
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2">{r.quantity}</td>
                  <td className="p-2">{r.unit}</td>
                  <td className="p-2 text-right font-mono">{r.fcfa.toLocaleString()}</td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(i)}
                      disabled={disabled}
                      className="text-destructive hover:bg-destructive/10 p-1 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-semibold">
              <tr>
                <td colSpan={3} className="p-2 text-right">{t('common.total', 'Total FCFA')} :</td>
                <td className="p-2 text-right font-mono text-primary">
                  {rows.reduce((sum, r) => sum + r.fcfa, 0).toLocaleString()}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
};
