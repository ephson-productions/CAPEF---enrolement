import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import {
  formatLineItemTitle,
  getOptionLabel,
} from '@/lib/i18n-helpers';

interface ActivityLineItemsTableProps {
  activityType: string;
  items: any[];
  onDeleteLine?: (itemId: number) => void;
  isDeleting?: boolean;
}

export const ActivityLineItemsTable: React.FC<ActivityLineItemsTableProps> = ({
  activityType,
  items,
  onDeleteLine,
  isDeleting = false,
}) => {
  const { t } = useTranslation();

  const incompleteBadge = (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 ml-1">
      {t('activities.validation.legacy_incomplete', 'à compléter')}
    </span>
  );

  const renderSpecifics = (item: any) => {
    const parts: React.ReactNode[] = [];
    const unitLabel = activityType === 'artisan' ? 'm²' : t('activities.unit_ha', 'ha');

    // 1. Superficie MUST ALWAYS be displayed first across all 5 categories
    if (item.parentLineItemId || item.cultureType === 'Associée') {
      parts.push(
        <span key="area">
          {t('activities.superficie_short', 'Superficie:')} {t('activities.inherited_area', 'Superficie héritée')}
        </span>
      );
    } else if (item.superficieHa !== null && item.superficieHa !== undefined) {
      parts.push(
        <span key="area">
          {t('activities.superficie_short', 'Superficie:')} {item.superficieHa} {unitLabel}
        </span>
      );
    } else {
      parts.push(
        <span key="area" className="text-muted-foreground">
          {t('activities.superficie_short', 'Superficie:')} — {incompleteBadge}
        </span>
      );
    }

    // 2. Specific additional attributes
    if (activityType === 'agriculteur') {
      const typeLabel = item.cultureType ? getOptionLabel('culture_type', item.cultureType, t) : '—';
      parts.push(
        <span key="culture_type">
          , {t('activities.culture_type_short', 'Type:')} {typeLabel}
        </span>
      );
    } else if (activityType === 'eleveur') {
      const cheptelStr = item.cheptelSize !== null && item.cheptelSize !== undefined ? item.cheptelSize : '—';
      const foodLabel = item.foodType ? getOptionLabel('feed_type', item.foodType, t) : '—';
      parts.push(
        <span key="cheptel">
          , {t('activities.cheptel_short', 'Cheptel:')} {cheptelStr}
        </span>,
        <span key="food">
          , {t('activities.food_short', 'Nourriture:')} {foodLabel}
        </span>
      );
    } else if (activityType === 'forestier') {
      if (item.subCategory === 'cultivé') {
        const plantLabel = item.plantationType ? getOptionLabel('plantation_type', item.plantationType, t) : '—';
        parts.push(
          <span key="plantation">
            , {t('activities.plantation_type_short', 'Plantation:')} {plantLabel}
          </span>
        );
      }
    } else if (activityType === 'artisan') {
      if (item.rawMaterials) {
        const rawTokens = item.rawMaterials.split(';').map((tok: string) => {
          const trimmed = tok.trim();
          return getOptionLabel('raw_materials', trimmed, t);
        });
        parts.push(
          <span key="raw_mat">
            , {t('activities.raw_mat_short', 'Matières:')} {rawTokens.join(', ')}
          </span>
        );
      }
    }

    return <div className="text-xs text-foreground">{parts}</div>;
  };

  const renderProduction = (item: any) => {
    if (activityType === 'eleveur' || activityType === 'forestier') {
      if (Array.isArray(item.products) && item.products.length > 0) {
        return (
          <ul className="space-y-0.5 text-xs">
            {item.products.map((p: any, idx: number) => {
              const unitVal = p.unit ? getOptionLabel('production_units', p.unit, t) : '—';
              return (
                <li key={idx} className="flex justify-between gap-2">
                  <span className="font-medium text-muted-foreground">{p.name}:</span>
                  <span>{p.quantity} {unitVal}</span>
                </li>
              );
            })}
          </ul>
        );
      }
      return <span className="text-muted-foreground">— {incompleteBadge}</span>;
    }

    if (item.productionQuantity !== null && item.productionQuantity !== undefined && item.productionUnit) {
      const unitVal = getOptionLabel('production_units', item.productionUnit, t);
      return (
        <span className="text-xs font-medium">
          {item.productionQuantity} {unitVal}
        </span>
      );
    }

    return <span className="text-muted-foreground">— {incompleteBadge}</span>;
  };

  const renderValue = (item: any) => {
    let fcfaVal = item.productionFcfa;

    if ((activityType === 'eleveur' || activityType === 'forestier') && Array.isArray(item.products) && item.products.length > 0) {
      fcfaVal = item.products.reduce((sum: number, p: any) => sum + (p.fcfa || 0), 0);
    }

    if (fcfaVal !== null && fcfaVal !== undefined) {
      return <span className="font-mono text-xs font-semibold">{fcfaVal.toLocaleString()} FCFA</span>;
    }

    return <span className="text-muted-foreground">— {incompleteBadge}</span>;
  };

  if (!items || items.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        {t('activities.no_line_items', 'Aucune ligne d\'activité enregistrée.')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted text-muted-foreground text-xs font-semibold">
          <tr>
            <th className="p-3">{t('activities.table.details', 'Détails / Produit')}</th>
            <th className="p-3">{t('activities.table.specifics', 'Specifics')}</th>
            <th className="p-3">{t('activities.table.production', 'Production')}</th>
            <th className="p-3 text-right">{t('activities.table.value', 'Value')}</th>
            {onDeleteLine && <th className="p-3 text-right">{t('common.action', 'Action')}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-muted/10">
              <td className="p-3 font-medium text-foreground">
                {formatLineItemTitle(item, activityType, t) || '—'}
              </td>
              <td className="p-3">{renderSpecifics(item)}</td>
              <td className="p-3">{renderProduction(item)}</td>
              <td className="p-3 text-right">{renderValue(item)}</td>
              {onDeleteLine && (
                <td className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDeleteLine(item.id)}
                    disabled={isDeleting}
                    className="p-1 text-destructive hover:bg-destructive/10 rounded disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
