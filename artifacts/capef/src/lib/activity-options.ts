export type ActivityOption = {
  readonly value: string;
  readonly key: string;
};

export type OptionGroup =
  | 'maillons_agriculteur'
  | 'maillons_pecheur'
  | 'maillons_eleveur'
  | 'maillons_forestier'
  | 'maillons_artisan'
  | 'crop_category'
  | 'culture_type'
  | 'fish_species'
  | 'livestock_type'
  | 'feed_type'
  | 'forestry_subcategory'
  | 'plantation_type'
  | 'artisan_product'
  | 'production_units'
  | 'livestock_product'
  | 'forestry_product'
  | 'raw_materials'
  | 'essence_exploite'
  | 'essence_cultive'
  | 'essence_non_ligneux'
  | 'species_volaille'
  | 'species_apiculture'
  | 'species_bovins'
  | 'species_canins'
  | 'species_asins'
  | 'species_ovins'
  | 'species_caprins'
  | 'species_non_conventionnel';

export const UNCONVENTIONAL_LIVESTOCK_EXTENSIONS = ['Porcs', 'Chevaux'] as const;

export const ACTIVITY_OPTIONS: Record<OptionGroup, readonly ActivityOption[]> = {
  maillons_agriculteur: [
    { value: 'Production', key: 'production' },
    { value: 'Transformation', key: 'transformation' },
    { value: 'Distribution', key: 'distribution' },
    { value: 'Prestation de service', key: 'prestation_service' },
    { value: "Fourniture d'intrants", key: 'fourniture_intrants' },
  ],
  maillons_pecheur: [
    { value: 'Pêcheur artisanal', key: 'pecheur_artisanal' },
    { value: 'Pêcheur industriel', key: 'pecheur_industriel' },
    { value: "Aquaculteur d'étang", key: 'aquaculteur_etang' },
    { value: 'Aquaculteur hors-sol', key: 'aquaculteur_hors_sol' },
    { value: 'Aquaculteur sur cage flottante', key: 'aquaculteur_cage_flottante' },
    { value: "Fournisseur d'intrants", key: 'fournisseur_intrants' },
    { value: 'Équipementier', key: 'equipementier' },
    { value: "Producteur d'alevins", key: 'producteur_alevins' },
    { value: 'Provendier', key: 'provendier' },
    { value: 'Autre', key: 'autre' },
  ],
  maillons_eleveur: [
    { value: 'Éleveur naisseur', key: 'eleveur_naisseur' },
    { value: 'Engraisseur', key: 'engraisseur' },
    { value: 'Fournisseur de provendes', key: 'fournisseur_provendes' },
    { value: "Producteur d'intrants", key: 'producteur_intrants' },
    { value: 'Abattage', key: 'abattage' },
    { value: 'Boucher / Charcutier', key: 'boucher_charcutier' },
    { value: 'Autre', key: 'autre' },
  ],
  maillons_forestier: [
    { value: 'Exploitant forestier', key: 'exploitant_forestier' },
    { value: 'Sylviculteur', key: 'sylviculteur' },
    { value: 'Exploitant de produits de la faune', key: 'exploitant_faune' },
    { value: 'Exploitant de PFNL', key: 'exploitant_pfnl' },
  ],
  maillons_artisan: [
    { value: 'Artisan producteur', key: 'artisan_producteur' },
    { value: "Distributeur d'artisanat", key: 'distributeur_artisanat' },
    { value: 'Matières premières', key: 'matieres_premieres' },
    { value: 'Autre', key: 'autre' },
  ],
  crop_category: [
    { value: 'Céréales', key: 'cereales' },
    { value: 'Oléagineux', key: 'oleagineux' },
    { value: 'Racines-tubercules', key: 'racines_tubercules' },
    { value: 'Légumes', key: 'legumes' },
    { value: 'Fruits et noix', key: 'fruits_noix' },
    { value: 'Plantes stimulantes', key: 'plantes_stimulantes' },
    { value: 'Légumineuses', key: 'legumineuses' },
    { value: 'Cultures sucrières', key: 'cultures_sucrieres' },
    { value: 'Autres', key: 'autres' },
  ],
  culture_type: [
    { value: 'Pure', key: 'pure' },
    { value: 'Associée', key: 'associee' },
  ],
  fish_species: [
    { value: 'Poissons de mer', key: 'poissons_mer' },
    { value: 'Crustacés', key: 'crustaces' },
    { value: "Poissons d'eau douce Silure", key: 'silure' },
    { value: 'Tilapia', key: 'tilapia' },
    { value: 'Carpe', key: 'carpe' },
    { value: 'Autres', key: 'autres' },
  ],
  livestock_type: [
    { value: 'Volaille', key: 'volaille' },
    { value: 'Apiculture', key: 'apiculture' },
    { value: 'Bovins', key: 'bovins' },
    { value: 'Canins', key: 'canins' },
    { value: 'Asins', key: 'asins' },
    { value: 'Ovins', key: 'ovins' },
    { value: 'Caprins', key: 'caprins' },
    { value: 'Non-conventionnel', key: 'non_conventionnel' },
  ],
  feed_type: [
    { value: 'Pâturage naturel', key: 'paturage_naturel' },
    { value: 'Céréales', key: 'cereales' },
    { value: 'Tourteaux', key: 'tourteaux' },
    { value: 'Autres', key: 'autres' },
  ],
  forestry_subcategory: [
    { value: 'exploité', key: 'exploite' },
    { value: 'cultivé', key: 'cultive' },
    { value: 'faune', key: 'faune' },
    { value: 'non-ligneux', key: 'non_ligneux' },
  ],
  plantation_type: [
    { value: 'Monospécifique', key: 'monospecifique' },
    { value: 'Plurispécifique', key: 'plurispecifique' },
  ],
  artisan_product: [
    { value: 'Boissons', key: 'boissons' },
    { value: 'Farines', key: 'farines' },
    { value: 'Confiserie', key: 'confiserie' },
    { value: 'Biscuiterie', key: 'biscuiterie' },
    { value: 'Chips', key: 'chips' },
    { value: 'Huiles alimentaires', key: 'huiles_alimentaires' },
    { value: 'Tissus', key: 'tissus' },
    { value: 'Cosmétiques', key: 'cosmetiques' },
    { value: 'Bijoux', key: 'bijoux' },
    { value: 'Autres', key: 'autres' },
  ],
  production_units: [
    { value: 'kg', key: 'kg' },
    { value: 't', key: 't' },
    { value: 'sac', key: 'sac' },
    { value: 'L', key: 'L' },
    { value: 'unité', key: 'unite' },
    { value: 'm²', key: 'm2' },
    { value: 'm³', key: 'm3' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  livestock_product: [
    { value: 'Lait', key: 'lait' },
    { value: 'Viande', key: 'viande' },
    { value: 'Œufs', key: 'oeufs' },
    { value: 'Cire', key: 'cire' },
    { value: 'Miel', key: 'miel' },
    { value: 'Autres (préciser)', key: 'autres' },
  ],
  forestry_product: [
    { value: 'Grumes', key: 'grumes' },
    { value: 'Planches', key: 'planches' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  raw_materials: [
    { value: 'Tronc de plantain', key: 'tronc_plantain' },
    { value: 'Tissus', key: 'tissus' },
    { value: 'Bamboo', key: 'bamboo' },
    { value: 'Autres (préciser)', key: 'autres' },
  ],
  essence_exploite: [
    { value: 'Ayous', key: 'ayous' },
    { value: 'Azobé', key: 'azobe' },
    { value: 'Bubinga', key: 'bubinga' },
    { value: 'Okok', key: 'okok' },
    { value: 'Djansan', key: 'djansan' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  essence_cultive: [
    { value: 'Mango', key: 'mango' },
    { value: 'Kolatier', key: 'kolatier' },
    { value: 'Bitter kola', key: 'bitter_kola' },
    { value: 'Noisette', key: 'noisette' },
    { value: 'Moringa', key: 'moringa' },
    { value: 'Neem', key: 'neem' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  essence_non_ligneux: [
    { value: 'Karité', key: 'karite' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  species_volaille: [
    { value: 'Poulets chair', key: 'poulets_chair' },
    { value: 'Poulets race locale', key: 'poulets_race_locale' },
    { value: 'Poulets pondeurs', key: 'poulets_pondeurs' },
    { value: 'Pintades', key: 'pintades' },
    { value: 'Dindons', key: 'dindons' },
    { value: 'Canards', key: 'canards' },
    { value: 'Oies', key: 'oies' },
    { value: 'Caille', key: 'caille' },
    { value: 'Pigeons', key: 'pigeons' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  species_apiculture: [
    { value: 'Abeilles', key: 'abeilles' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  species_bovins: [
    { value: 'Bœufs', key: 'boeufs' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  species_canins: [
    { value: 'Chiens', key: 'chiens' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  species_asins: [
    { value: 'Ânes', key: 'anes' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  species_ovins: [
    { value: 'Moutons', key: 'moutons' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  species_caprins: [
    { value: 'Chèvres', key: 'chevres' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
  species_non_conventionnel: [
    { value: 'Lapins', key: 'lapins' },
    { value: 'Aulacodes', key: 'aulacodes' },
    { value: 'Cobayes', key: 'cobayes' },
    { value: 'Escargots', key: 'escargots' },
    { value: 'Porcs', key: 'porcs' },
    { value: 'Chevaux', key: 'chevaux' },
    { value: 'Autre (préciser)', key: 'autre' },
  ],
};
