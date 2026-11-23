import { describe, expect, it } from 'vitest';
import { formSchema, toDefaultValues } from '@/pages/members/MemberForm';

describe('member form defaults', () => {
  it('keeps physical contact, residence, media, GPS, and category values when editing', () => {
    const defaults = toDefaultValues({
      memberType: 'physique',
      category: 'agriculteur',
      regionId: 3,
      departmentId: 7,
      arrondissementId: 11,
      gpsLat: 4.05,
      gpsLng: 9.72,
      categoryData: { superficie: 4.5, cultures: 'Cacao' },
      physiqueData: {
        nom: 'MANGA',
        prenom: 'Aline',
        lieuResidence: 'Bafoussam',
        boitePostale: 'BP 42',
        photoUrl: '/photo.jpg',
        cniRectoUrl: '/cni-front.jpg',
        cniVersoUrl: '/cni-back.jpg',
        signatureUrl: '/signature.png',
      },
    } as any);

    expect(defaults).toMatchObject({
      memberType: 'physique',
      regionId: 3,
      departmentId: 7,
      arrondissementId: 11,
      gpsLat: 4.05,
      gpsLng: 9.72,
      categoryData: { superficie: 4.5, cultures: 'Cacao' },
      physiqueData: {
        nom: 'MANGA',
        prenom: 'Aline',
        lieuResidence: 'Bafoussam',
        boitePostale: 'BP 42',
        photoUrl: '/photo.jpg',
        cniRectoUrl: '/cni-front.jpg',
        cniVersoUrl: '/cni-back.jpg',
        signatureUrl: '/signature.png',
      },
    });
  });

  it('keeps organization documents and representatives when editing', () => {
    const defaults = toDefaultValues({
      memberType: 'morale',
      category: 'agriculteur',
      categoryData: { superficie: 9 },
      moraleData: {
        nom: 'GIC Exemple',
        certificatUrl: '/certificat.pdf',
        representants: [{ ordre: 1, nom: 'MANGA', prenom: 'Aline' }],
      },
    } as any);

    expect(defaults.moraleData).toMatchObject({
      nom: 'GIC Exemple',
      certificatUrl: '/certificat.pdf',
      representants: [{ ordre: 1, nom: 'MANGA', prenom: 'Aline' }],
    });
    expect(defaults.categoryData).toEqual({ superficie: 9 });
  });

  it('accepts optional physical residence fields in form submissions', () => {
    const parsed = formSchema.parse({
      memberType: 'physique',
      category: 'agriculteur',
      physiqueData: {
        nom: 'MANGA',
        prenom: 'Aline',
        lieuResidence: 'Bafoussam',
        boitePostale: 'BP 42',
      },
    });

    expect(parsed.physiqueData).toMatchObject({
      lieuResidence: 'Bafoussam',
      boitePostale: 'BP 42',
    });
  });
});
