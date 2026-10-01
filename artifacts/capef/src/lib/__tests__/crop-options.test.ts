import { describe, it, expect } from 'vitest';
import { ACTIVITY_OPTIONS, OptionGroup } from '../activity-options';

describe('Agriculture Form — Crop Category & Precise Crop Options Mapping Tests', () => {
  it('1. Every crop category defined in crop_category has a corresponding non-empty precise crops group', () => {
    const categories = ACTIVITY_OPTIONS.crop_category;
    expect(categories.length).toBeGreaterThan(0);

    const getCropGroupKey = (cat: string): OptionGroup | null => {
      switch (cat) {
        case 'Céréales': return 'crops_cereales';
        case 'Oléagineux': return 'crops_oleagineux';
        case 'Racines-tubercules': return 'crops_racines_tubercules';
        case 'Légumes': return 'crops_legumes';
        case 'Fruits et noix': return 'crops_fruits_noix';
        case 'Plantes stimulantes': return 'crops_plantes_stimulantes';
        case 'Légumineuses': return 'crops_legumineuses';
        case 'Cultures sucrières': return 'crops_cultures_sucrieres';
        case 'Autres': return 'crops_autres';
        default: return null;
      }
    };

    categories.forEach((catOpt) => {
      const groupKey = getCropGroupKey(catOpt.value);
      expect(groupKey, `Group key for category '${catOpt.value}' should not be null`).not.toBeNull();
      const options = ACTIVITY_OPTIONS[groupKey!];
      expect(options, `Options for group '${groupKey}' should exist`).toBeDefined();
      expect(options.length, `Options for group '${groupKey}' should not be empty`).toBeGreaterThan(0);
    });
  });

  it('2. Céréales category specifically contains Maïs, Riz, Sorgho, and Millet', () => {
    const cerealesCrops = ACTIVITY_OPTIONS.crops_cereales;
    const values = cerealesCrops.map((c) => c.value);

    expect(values).toContain('Maïs');
    expect(values).toContain('Riz');
    expect(values).toContain('Sorgho');
    expect(values).toContain('Millet');
  });

  it('3. Precise crops belong strictly to their intended category and do not bleed across groups', () => {
    const cerealesValues = ACTIVITY_OPTIONS.crops_cereales.map((c) => c.value);
    const legumesValues = ACTIVITY_OPTIONS.crops_legumes.map((c) => c.value);

    expect(cerealesValues).not.toContain('Tomate');
    expect(legumesValues).toContain('Tomate');
    expect(legumesValues).not.toContain('Maïs');
  });
});
