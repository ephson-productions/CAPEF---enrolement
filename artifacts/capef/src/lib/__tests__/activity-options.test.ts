import { describe, it, expect } from 'vitest';
import fr from '../../locales/fr.json';
import en from '../../locales/en.json';
import { ACTIVITY_OPTIONS, OptionGroup } from '../activity-options';
import {
  normalizeOptionValue,
  getOptionLabel,
  getMaillonLabel,
  formatLineItemTitle,
  formatLineItemSpecifics
} from '../i18n-helpers';

function getNestedKeys(obj: any, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k in obj) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      keys = keys.concat(getNestedKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('Activity Options & i18n Translation Integrity', () => {
  it('1. Verifies strict parity between fr.json and en.json flattened key sets', () => {
    const frKeys = new Set(getNestedKeys(fr));
    const enKeys = new Set(getNestedKeys(en));

    const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));
    const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));

    expect(missingInEn, `Keys present in fr.json but missing in en.json: ${missingInEn.join(', ')}`).toEqual([]);
    expect(missingInFr, `Keys present in en.json but missing in fr.json: ${missingInFr.join(', ')}`).toEqual([]);
  });

  it('2. Verifies that every option in ACTIVITY_OPTIONS has an explicit translation in both fr.json and en.json', () => {
    const frOptions = (fr as any).activities?.options || {};
    const enOptions = (en as any).activities?.options || {};

    for (const groupKey in ACTIVITY_OPTIONS) {
      const group = groupKey as OptionGroup;
      const options = ACTIVITY_OPTIONS[group];

      expect(frOptions[group], `Missing group ${group} in fr.json activities.options`).toBeDefined();
      expect(enOptions[group], `Missing group ${group} in en.json activities.options`).toBeDefined();

      const seenValues = new Set<string>();
      const seenKeys = new Set<string>();

      options.forEach((opt) => {
        expect(seenValues.has(opt.value), `Duplicate value '${opt.value}' in group ${group}`).toBe(false);
        expect(seenKeys.has(opt.key), `Duplicate key '${opt.key}' in group ${group}`).toBe(false);
        seenValues.add(opt.value);
        seenKeys.add(opt.key);

        const frTranslation = frOptions[group]?.[opt.key];
        const enTranslation = enOptions[group]?.[opt.key];

        expect(frTranslation, `Option '${opt.key}' in group '${group}' missing in fr.json`).toBeTruthy();
        expect(enTranslation, `Option '${opt.key}' in group '${group}' missing in en.json`).toBeTruthy();
      });
    }
  });

  it('3. Verifies string normalization and getOptionLabel robust matching & fallback', () => {
    const mockTEn = (key: string) => {
      const parts = key.split('.');
      let current: any = en;
      for (const p of parts) {
        current = current?.[p];
      }
      return typeof current === 'string' ? current : key;
    };

    // Robust matching tests: apostrophes, accents, casing, spaces
    expect(getOptionLabel('maillons_agriculteur', "Fourniture d'intrants", mockTEn)).toBe('Input supply');
    expect(getOptionLabel('maillons_agriculteur', "FOURNITURE D’INTRANTS", mockTEn)).toBe('Input supply');
    expect(getOptionLabel('crop_category', "Racines-tubercules", mockTEn)).toBe('Roots & tubers');
    expect(getOptionLabel('crop_category', "RACINES-TUBERCULES", mockTEn)).toBe('Roots & tubers');

    // Free user input fallback
    expect(getOptionLabel('crop_category', 'Plantain', mockTEn)).toBe('Plantain');
    expect(getOptionLabel('fish_species', 'Capitaine', mockTEn)).toBe('Capitaine');

    // Safe handling of null, undefined, empty string
    expect(getOptionLabel('crop_category', null, mockTEn)).toBe(null);
    expect(getOptionLabel('crop_category', undefined, mockTEn)).toBe(undefined);
    expect(getOptionLabel('crop_category', '', mockTEn)).toBe('');
  });

  it('4. Verifies getMaillonLabel helper mapping', () => {
    const mockTEn = (key: string) => {
      const parts = key.split('.');
      let current: any = en;
      for (const p of parts) {
        current = current?.[p];
      }
      return typeof current === 'string' ? current : key;
    };

    expect(getMaillonLabel('agriculteur', 'Transformation', mockTEn)).toBe('Processing');
    expect(getMaillonLabel('pecheur', "Aquaculteur d'étang", mockTEn)).toBe('Pond fish farmer');
    expect(getMaillonLabel('forestier', 'Sylviculteur', mockTEn)).toBe('Silviculturist');
  });

  it('5. Verifies line item title and specifics formatting helpers', () => {
    const mockTEn = (key: string) => {
      const parts = key.split('.');
      let current: any = en;
      for (const p of parts) {
        current = current?.[p];
      }
      return typeof current === 'string' ? current : key;
    };

    const agItem = {
      cropCategory: 'Céréales',
      cropName: 'Maïs',
      cultureType: 'Pure',
      superficieHa: 2.5,
    };

    expect(formatLineItemTitle(agItem, 'agriculteur', mockTEn)).toBe('Cereals - Maïs');
    expect(formatLineItemSpecifics(agItem, 'agriculteur', mockTEn)).toBe('Type: Pure (sole crop), Area: 2.5 ha');
  });
});
