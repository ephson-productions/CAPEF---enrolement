import React, { useState, useEffect } from 'react';
import {
  useCreateMemberActivity,
  useCreateActivityLineItem,
  useDeleteActivityLineItem,
  useListMemberActivities,
  useListRegions,
  useListDepartments,
  useListArrondissements,
  useGetMember
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, Trash2, Check, AlertTriangle, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ActivityWizardProps {
  memberId: number;
  onComplete?: () => void;
}

export default function ActivityWizard({ memberId, onComplete }: ActivityWizardProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: member } = useGetMember(memberId);
  const { data: activities, refetch: refetchActivities } = useListMemberActivities(memberId);

  // Geographic ref data for activity localisation
  const { data: regions } = useListRegions();
  const [selectedReg, setSelectedReg] = useState<number | null>(null);

  const { data: departments } = useListDepartments(
    { regionId: selectedReg || undefined },
    {
      query: {
        enabled: !!selectedReg,
        queryKey: ['departments', { regionId: selectedReg }]
      }
    }
  );

  const [selectedDept, setSelectedDept] = useState<number | null>(null);

  const { data: arrondissements } = useListArrondissements(
    { departmentId: selectedDept || undefined },
    {
      query: {
        enabled: !!selectedDept,
        queryKey: ['arrondissements', { departmentId: selectedDept }]
      }
    }
  );

  const [selectedArr, setSelectedArr] = useState<number | null>(null);
  const [village, setVillage] = useState('');

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<'agriculteur' | 'pecheur' | 'eleveur' | 'forestier' | 'artisan'>('agriculteur');

  // Selected maillons
  const [selectedMaillons, setSelectedMaillons] = useState<string[]>([]);

  // Create hooks
  const createActivity = useCreateMemberActivity();
  const createLineItem = useCreateActivityLineItem();

  useEffect(() => {
    if (member) {
      setSelectedType(member.category as any);
      setSelectedReg(member.regionId || null);
      setSelectedDept(member.departmentId || null);
      setSelectedArr(member.arrondissementId || null);
      setVillage(member.village || '');
    }
  }, [member]);

  // Specific forms states
  // Agriculture
  const [cropCategory, setCropCategory] = useState('');
  const [cropName, setCropName] = useState('');
  const [cultureType, setCultureType] = useState('Pure');
  const [superficieHa, setSuperficieHa] = useState('');
  const [prodQuantity, setProdQuantity] = useState('');
  const [prodUnit, setProdUnit] = useState('');
  const [prodFcfa, setProdFcfa] = useState('');

  // Pêche
  const [pesceSpecies, setPesceSpecies] = useState('');

  // Élevage
  const [elevageType, setElevageType] = useState('');
  const [species, setSpecies] = useState('');
  const [cheptelSize, setCheptelSize] = useState('');
  const [foodType, setFoodType] = useState('');
  const [prodName, setProdName] = useState(''); // e.g. Lait/Viande/Oeufs
  const [elevageProducts, setElevageProducts] = useState<Array<{ name: string; quantity: number; unit: string; fcfa: number }>>([]);

  // Forêts
  const [foretSub, setForetSub] = useState<'exploité' | 'cultivé' | 'faune' | 'non-ligneux'>('exploité');
  const [essence, setEssence] = useState('');
  const [plantationType, setPlantationType] = useState('Monospécifique');

  // Artisanat
  const [artProd, setArtProd] = useState('');
  const [rawMat, setRawMat] = useState('');

  // Find active activity of the current selected type for this member if exists
  const activeActivity = activities?.find(act => act.activityType === selectedType);

  const handleNextStep = async () => {
    if (step === 1) {
      // Localisation & Type Setup
      try {
        if (!activeActivity) {
          await createActivity.mutateAsync({
            id: memberId,
            data: {
              activityType: selectedType,
              isPrimary: member?.category === selectedType,
              regionId: selectedReg,
              departmentId: selectedDept,
              arrondissementId: selectedArr,
              village,
              maillons: selectedMaillons,
            }
          });
        }
        await refetchActivities();
        setStep(2);
      } catch (err) {
        toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.create_failed', 'Échec de la création du questionnaire.') });
      }
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleAddLineItem = async () => {
    if (!activeActivity) return;

    try {
      const payload: any = {};

      if (selectedType === 'agriculteur') {
        if (!cropCategory || !cropName) {
          toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.crop_req', 'Catégorie et culture principale requises.') });
          return;
        }
        // Duplicate check
        const isDuplicate = activeActivity.lineItems?.some(
          item => item.cropName?.toLowerCase() === cropName.toLowerCase()
        );
        if (isDuplicate) {
          toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.duplicate_crop', 'Cette culture a déjà été ajoutée pour ce membre.') });
          return;
        }

        payload.cropCategory = cropCategory;
        payload.cropName = cropName;
        payload.cultureType = cultureType;
        payload.superficieHa = superficieHa ? parseFloat(superficieHa) : null;
        payload.productionQuantity = prodQuantity ? parseFloat(prodQuantity) : null;
        payload.productionUnit = prodUnit || null;
        payload.productionFcfa = prodFcfa ? parseFloat(prodFcfa) : null;
      }
      else if (selectedType === 'pecheur') {
        if (!pesceSpecies) {
          toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.species_req', 'Espèce principale requise.') });
          return;
        }
        payload.speciesPêche = pesceSpecies;
        payload.productionQuantity = prodQuantity ? parseFloat(prodQuantity) : null;
        payload.productionUnit = prodUnit || null;
        payload.productionFcfa = prodFcfa ? parseFloat(prodFcfa) : null;
      }
      else if (selectedType === 'eleveur') {
        if (!species || !cheptelSize) {
          toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.livestock_req', 'Espèce et taille du cheptel requises.') });
          return;
        }
        payload.species = species;
        payload.cheptelSize = parseInt(cheptelSize, 10);
        payload.foodType = foodType || null;
        payload.products = elevageProducts;
      }
      else if (selectedType === 'forestier') {
        if (!essence) {
          toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.essence_req', 'Essence forestière requise.') });
          return;
        }
        payload.subCategory = foretSub;
        payload.essence = essence;
        payload.plantationType = foretSub === 'cultivé' ? plantationType : null;
        payload.superficieHa = superficieHa ? parseFloat(superficieHa) : null;
        payload.productionQuantity = prodQuantity ? parseFloat(prodQuantity) : null;
        payload.productionUnit = prodUnit || null;
        payload.productionFcfa = prodFcfa ? parseFloat(prodFcfa) : null;
      }
      else if (selectedType === 'artisan') {
        if (!artProd || !rawMat) {
          toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.artisan_req', 'Produits et matières premières requis.') });
          return;
        }
        payload.artisanatProducts = artProd;
        payload.rawMaterials = rawMat;
        payload.productionQuantity = prodQuantity ? parseFloat(prodQuantity) : null;
        payload.productionUnit = prodUnit || null;
        payload.productionFcfa = prodFcfa ? parseFloat(prodFcfa) : null;
      }

      await createLineItem.mutateAsync({
        id: memberId,
        activityId: activeActivity.id,
        data: payload
      });
      await refetchActivities();

      // Reset specific inputs
      setCropName('');
      setSuperficieHa('');
      setProdQuantity('');
      setProdUnit('');
      setProdFcfa('');
      setPesceSpecies('');
      setSpecies('');
      setCheptelSize('');
      setFoodType('');
      setElevageProducts([]);
      setEssence('');
      setArtProd('');
      setRawMat('');

      toast({ title: t('common.success', 'Succès'), description: t('activities.toast.line_added', 'Ligne ajoutée avec succès.') });
    } catch (err) {
      toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.add_line_failed', 'Échec de l\'ajout de la ligne.') });
    }
  };

  const deleteLineItem = useDeleteActivityLineItem();
  const handleDeleteLine = async (itemId: number) => {
    if (!activeActivity) return;
    try {
      await deleteLineItem.mutateAsync({
        id: memberId,
        activityId: activeActivity.id,
        itemId
      });
      await refetchActivities();
      toast({ title: t('common.success', 'Succès'), description: t('activities.toast.line_deleted', 'Ligne supprimée.') });
    } catch (err) {
      toast({ variant: 'destructive', title: t('common.error', 'Erreur'), description: t('activities.toast.delete_failed', 'Échec de la suppression.') });
    }
  };

  const [wizardFinished, setWizardFinished] = useState(false);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm max-w-4xl mx-auto overflow-hidden">
      <div className="bg-primary/5 p-6 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-primary">{t('activities.title', 'Questionnaire d\'Activité')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t('activities.member_id', 'Enrôlement ID:')} {member?.memberNumber}</p>
        </div>
        <button
          onClick={() => {
            setLocation('/members');
            toast({ title: t('common.saved', 'Enregistré'), description: t('activities.toast.left_wizard', 'Vous avez quitté le questionnaire. Les données saisies ont été conservées.') });
          }}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-input rounded-md px-3 py-1.5 bg-background transition-colors"
        >
          {t('activities.quit_and_return', 'Quitter & Retour au Menu')}
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Stepper progress indicator */}
        <div className="flex items-center justify-center gap-2">
          {[t('activities.steps.step1', '1. Localisation & Type'), t('activities.steps.step2', '2. Questionnaire'), t('activities.steps.step3', '3. Récapitulatif')].map((lbl, idx) => (
            <React.Fragment key={idx}>
              <div className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === idx + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {idx + 1}
                </div>
                <span className={`text-sm ${step === idx + 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{lbl}</span>
              </div>
              {idx < 2 && <div className="w-12 h-0.5 bg-border" />}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">{t('activities.step1_title', 'Étape 1 : Localisation spécifique de l\'activité')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('activities.category_label', 'Catégorie d\'activité')}</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as any)}
                  className="w-full border rounded-md p-2 bg-background"
                >
                  <option value="agriculteur">{t('members.categories.agriculteur', 'Agriculteur / Agriculture')}</option>
                  <option value="pecheur">{t('members.categories.pecheur', 'Pêcheur / Aquaculture')}</option>
                  <option value="eleveur">{t('members.categories.eleveur', 'Éleveur / Élevage')}</option>
                  <option value="forestier">{t('members.categories.forestier', 'Exploitant Forestier')}</option>
                  <option value="artisan">{t('members.categories.artisan', 'Artisan / Artisanat')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('members.filters.region', 'Région')}</label>
                <select
                  value={selectedReg || ''}
                  onChange={(e) => {
                    setSelectedReg(e.target.value ? parseInt(e.target.value, 10) : null);
                    setSelectedDept(null);
                    setSelectedArr(null);
                  }}
                  className="w-full border rounded-md p-2 bg-background"
                >
                  <option value="">{t('common.select_region', 'Sélectionner une région')}</option>
                  {regions?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('members.filters.department', 'Département')}</label>
                <select
                  value={selectedDept || ''}
                  disabled={!selectedReg}
                  onChange={(e) => {
                    setSelectedDept(e.target.value ? parseInt(e.target.value, 10) : null);
                    setSelectedArr(null);
                  }}
                  className="w-full border rounded-md p-2 bg-background"
                >
                  <option value="">{t('common.select_department', 'Sélectionner un département')}</option>
                  {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('members.filters.arrondissement', 'Arrondissement')}</label>
                <select
                  value={selectedArr || ''}
                  disabled={!selectedDept}
                  onChange={(e) => setSelectedArr(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="w-full border rounded-md p-2 bg-background"
                >
                  <option value="">{t('common.select_arrondissement', 'Sélectionner un arrondissement')}</option>
                  {arrondissements?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">{t('activities.village_label', 'Village / Quartier de l\'exploitation')}</label>
                <input
                  type="text"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder={t('activities.village_placeholder', 'Nom du village ou quartier')}
                  className="w-full border rounded-md p-2 bg-background"
                />
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <label className="block text-sm font-medium">{t('activities.maillons_label', 'Maillons dans la filière (Sélection multiple)')}</label>
              <div className="grid grid-cols-2 gap-2 border p-3 rounded-md bg-muted/20">
                {selectedType === 'agriculteur' && ['Production', 'Transformation', 'Distribution', 'Prestation de service', 'Fourniture d\'intrants'].map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedMaillons.includes(m)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMaillons([...selectedMaillons, m]);
                        else setSelectedMaillons(selectedMaillons.filter(x => x !== m));
                      }}
                    />
                    {m}
                  </label>
                ))}
                {selectedType === 'pecheur' && ['Pêcheur artisanal', 'Pêcheur industriel', 'Aquaculteur d\'étang', 'Aquaculteur hors-sol', 'Aquaculteur sur cage flottante', 'Fournisseur d\'intrants', 'Équipementier', 'Producteur d\'alevins', 'Provendier', 'Autre'].map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedMaillons.includes(m)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMaillons([...selectedMaillons, m]);
                        else setSelectedMaillons(selectedMaillons.filter(x => x !== m));
                      }}
                    />
                    {m}
                  </label>
                ))}
                {selectedType === 'eleveur' && ['Éleveur naisseur', 'Engraisseur', 'Fournisseur de provendes', 'Producteur d\'intrants', 'Abattage', 'Boucher / Charcutier', 'Autre'].map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedMaillons.includes(m)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMaillons([...selectedMaillons, m]);
                        else setSelectedMaillons(selectedMaillons.filter(x => x !== m));
                      }}
                    />
                    {m}
                  </label>
                ))}
                {selectedType === 'forestier' && ['Exploitant forestier', 'Sylviculteur', 'Exploitant de produits de la faune', 'Exploitant de PFNL'].map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedMaillons.includes(m)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMaillons([...selectedMaillons, m]);
                        else setSelectedMaillons(selectedMaillons.filter(x => x !== m));
                      }}
                    />
                    {m}
                  </label>
                ))}
                {selectedType === 'artisan' && ['Artisan producteur', 'Distributeur d\'artisanat', 'Matières premières', 'Autre'].map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedMaillons.includes(m)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMaillons([...selectedMaillons, m]);
                        else setSelectedMaillons(selectedMaillons.filter(x => x !== m));
                      }}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleNextStep}
                className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-2"
              >
                {t('common.next', 'Suivant')} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">{t('activities.step2_title', 'Étape 2 : Détails de la production')}</h3>

            {selectedType === 'agriculteur' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.crop_category', 'Catégorie de culture principale')}</label>
                  <select
                    value={cropCategory}
                    onChange={(e) => setCropCategory(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {['Céréales', 'Oléagineux', 'Racines-tubercules', 'Légumes', 'Fruits et noix', 'Plantes stimulantes', 'Légumineuses', 'Cultures sucrières', 'Autres'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.crop_name', 'Culture précise')}</label>
                  <input
                    type="text"
                    value={cropName}
                    onChange={(e) => setCropName(e.target.value)}
                    placeholder={t('activities.crop_placeholder', 'Ex: Maïs, Manioc...')}
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.culture_type', 'Type de culture')}</label>
                  <select
                    value={cultureType}
                    onChange={(e) => setCultureType(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  >
                    <option value="Pure">Pure</option>
                    <option value="Associée">Associée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.superficie', 'Superficie de la parcelle (ha)')}</label>
                  <input
                    type="number"
                    value={superficieHa}
                    onChange={(e) => setSuperficieHa(e.target.value)}
                    placeholder="Ex: 2.5"
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_quantity', 'Production annuelle (Quantité)')}</label>
                  <input
                    type="number"
                    value={prodQuantity}
                    onChange={(e) => setProdQuantity(e.target.value)}
                    placeholder="Ex: 500"
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_unit', 'Unité de production')}</label>
                  <input
                    type="text"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                    placeholder={t('activities.unit_placeholder', 'Ex: Tonnes, Sacs...')}
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_fcfa', 'Valeur de la production (FCFA)')}</label>
                  <input
                    type="number"
                    value={prodFcfa}
                    onChange={(e) => setProdFcfa(e.target.value)}
                    placeholder="Ex: 1500000"
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
              </div>
            )}

            {selectedType === 'pecheur' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.pesce_species', 'Espèce principale')}</label>
                  <select
                    value={pesceSpecies}
                    onChange={(e) => setPesceSpecies(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {['Poissons de mer', 'Crustacés', 'Poissons d\'eau douce Silure', 'Tilapia', 'Carpe', 'Autres'].map(e => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_quantity', 'Production annuelle (Quantité)')}</label>
                  <input
                    type="number"
                    value={prodQuantity}
                    onChange={(e) => setProdQuantity(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_unit', 'Unité de production')}</label>
                  <input
                    type="text"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                    placeholder="Ex: kg, tonnes"
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.value_fcfa', 'Valeur (FCFA)')}</label>
                  <input
                    type="number"
                    value={prodFcfa}
                    onChange={(e) => setProdFcfa(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
              </div>
            )}

            {selectedType === 'eleveur' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.elevage_type', 'Type d\'élevage')}</label>
                  <select
                    value={elevageType}
                    onChange={(e) => setElevageType(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {['Volaille', 'Apiculture', 'Bovins', 'Canins', 'Asins', 'Ovins', 'Caprins', 'Non-conventionnel'].map(tVal => (
                      <option key={tVal} value={tVal}>{tVal}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.species', 'Espèce élevée')}</label>
                  <input
                    type="text"
                    value={species}
                    onChange={(e) => setSpecies(e.target.value)}
                    placeholder="Ex: Boeufs, Poulets pondeurs..."
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.cheptel_size', 'Taille du cheptel (Têtes)')}</label>
                  <input
                    type="number"
                    value={cheptelSize}
                    onChange={(e) => setCheptelSize(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.food_type', 'Type de nourriture')}</label>
                  <select
                    value={foodType}
                    onChange={(e) => setFoodType(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {['Pâturage naturel', 'Céréales', 'Tourteaux', 'Autres'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 border-t pt-4 mt-2">
                  <h4 className="font-semibold text-sm mb-2 text-primary">{t('activities.elevage_products', 'Produits d\'élevage')}</h4>
                  <div className="grid grid-cols-4 gap-2 items-end">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">{t('activities.product_name', 'Nom du produit (Ex: Lait, Miel, Œufs)')}</label>
                      <input
                        type="text"
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                        className="w-full border rounded p-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">{t('activities.quantity', 'Quantité')}</label>
                      <input
                        type="number"
                        placeholder="Ex: 100"
                        id="elev_prod_qty"
                        className="w-full border rounded p-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          const qtyEl = document.getElementById('elev_prod_qty') as HTMLInputElement;
                          if (prodName && qtyEl?.value) {
                            setElevageProducts([...elevageProducts, {
                              name: prodName,
                              quantity: parseFloat(qtyEl.value),
                              unit: 'Unités',
                              fcfa: 0
                            }]);
                            setProdName('');
                            qtyEl.value = '';
                          }
                        }}
                        className="bg-secondary text-secondary-foreground font-semibold px-3 py-1.5 text-xs rounded hover:bg-secondary/90 w-full"
                      >
                        {t('activities.add_product', 'Ajouter Produit')}
                      </button>
                    </div>
                  </div>
                  {elevageProducts.length > 0 && (
                    <ul className="mt-2 text-xs divide-y bg-muted/20 p-2 rounded">
                      {elevageProducts.map((p, i) => (
                        <li key={i} className="py-1 flex justify-between">
                          <span>{p.name} : {p.quantity} {p.unit}</span>
                          <button onClick={() => setElevageProducts(elevageProducts.filter((_, j) => j !== i))} className="text-destructive hover:underline">{t('common.remove', 'Retirer')}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {selectedType === 'forestier' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.foret_sub', 'Sous-catégorie d\'exploitation')}</label>
                  <select
                    value={foretSub}
                    onChange={(e) => setForetSub(e.target.value as any)}
                    className="w-full border rounded-md p-2 bg-background"
                  >
                    <option value="exploité">Exploité (Ayous, Azobé, Bubinga, Okok, Djansan)</option>
                    <option value="cultivé">Cultivé (Mango, Kolatier, Bitter kola, Noisette)</option>
                    <option value="faune">Exploitant de produits de la faune</option>
                    <option value="non-ligneux">Exploitant de PFNL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.essence', 'Essence / Espèce précise')}</label>
                  <input
                    type="text"
                    value={essence}
                    onChange={(e) => setEssence(e.target.value)}
                    placeholder="Ex: Bubinga, Moringa..."
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                {foretSub === 'cultivé' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('activities.plantation_type', 'Type de plantation')}</label>
                    <select
                      value={plantationType}
                      onChange={(e) => setPlantationType(e.target.value)}
                      className="w-full border rounded-md p-2 bg-background"
                    >
                      <option value="Monospécifique">Monospécifique</option>
                      <option value="Plurispécifique">Plurispécifique</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.superficie', 'Superficie cultivée (ha)')}</label>
                  <input
                    type="number"
                    value={superficieHa}
                    onChange={(e) => setSuperficieHa(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.forest_value', 'Produits obtenus / Grumes, Planches (FCFA)')}</label>
                  <input
                    type="number"
                    value={prodFcfa}
                    onChange={(e) => setProdFcfa(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
              </div>
            )}

            {selectedType === 'artisan' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.artisan_products', 'Produits d\'artisanat')}</label>
                  <select
                    value={artProd}
                    onChange={(e) => setArtProd(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {['Boissons', 'Farines', 'Confiserie', 'Biscuiterie', 'Chips', 'Huiles alimentaires', 'Tissus', 'Cosmétiques', 'Bijoux', 'Autres'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.raw_mat', 'Matières premières utilisées')}</label>
                  <input
                    type="text"
                    value={rawMat}
                    onChange={(e) => setRawMat(e.target.value)}
                    placeholder="Ex: Tronc de plantain, Tissus, Bamboo..."
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_fcfa', 'Valeur de la production annuelle (FCFA)')}</label>
                  <input
                    type="number"
                    value={prodFcfa}
                    onChange={(e) => setProdFcfa(e.target.value)}
                    className="w-full border rounded-md p-2 bg-background"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4 border-t justify-between">
              <button
                onClick={() => setStep(1)}
                className="border border-input bg-background hover:bg-muted font-semibold px-4 py-2 rounded-md flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> {t('common.previous', 'Précédent')}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={handleAddLineItem}
                  disabled={createLineItem.isPending}
                  className="bg-secondary text-secondary-foreground font-semibold px-4 py-2 rounded-md hover:bg-secondary/90 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createLineItem.isPending ? (
                    <>{t('common.saving', 'Enregistrement...')}</>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" /> {t('activities.add_this_line', '+ Ajouter cette ligne')}
                    </>
                  )}
                </button>
                <button
                  onClick={handleNextStep}
                  className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-1.5"
                >
                  {t('common.next', 'Suivant')} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">{t('activities.step3_title', 'Étape 3 : Récapitulatif de la saisie')}</h3>

            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground text-xs font-semibold">
                  <tr>
                    <th className="p-3">{t('activities.table.details', 'Détails')}</th>
                    <th className="p-3">{t('activities.table.specifics', 'Spécificités')}</th>
                    <th className="p-3">{t('activities.table.production', 'Production (Quantité / Unité)')}</th>
                    <th className="p-3 text-right">{t('activities.table.value', 'Valeur (FCFA)')}</th>
                    <th className="p-3 text-right">{t('common.action', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activeActivity?.lineItems?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">{t('activities.no_line_items_step3', 'Aucune ligne d\'activité enregistrée. Veuillez retourner à l\'étape 2.')}</td>
                    </tr>
                  ) : (
                    activeActivity?.lineItems?.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/10">
                        <td className="p-3">
                          {selectedType === 'agriculteur' && `${item.cropCategory || ''} - ${item.cropName || ''}`}
                          {selectedType === 'pecheur' && item.speciesPêche}
                          {selectedType === 'eleveur' && item.species}
                          {selectedType === 'forestier' && `${item.subCategory || ''} - ${item.essence || ''}`}
                          {selectedType === 'artisan' && item.artisanatProducts}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {selectedType === 'agriculteur' && `Type: ${item.cultureType || ''}, Superficie: ${item.superficieHa || 'N/A'} ha`}
                          {selectedType === 'eleveur' && `Cheptel: ${item.cheptelSize || 'N/A'}, Nourriture: ${item.foodType || 'N/A'}`}
                          {selectedType === 'forestier' && `Plantation: ${item.plantationType || 'N/A'}, Superficie: ${item.superficieHa || 'N/A'} ha`}
                          {selectedType === 'artisan' && `Matières: ${item.rawMaterials || ''}`}
                        </td>
                        <td className="p-3">
                          {item.productionQuantity || 'N/A'} {item.productionUnit || ''}
                        </td>
                        <td className="p-3 text-right font-mono text-xs">{item.productionFcfa?.toLocaleString() || '0'}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteLine(item.id)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-4 flex gap-3 text-sm text-yellow-900 dark:text-yellow-200">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{t('activities.tech_note_title', 'Note technique :')}</span> {t('activities.tech_note_text', 'Activité sauvegardée localement. Elle sera transmise lors de la reconnexion.')}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <button
                onClick={() => setStep(2)}
                className="border border-input bg-background hover:bg-muted font-semibold px-4 py-2 rounded-md flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> {t('activities.back_to_form', 'Retour au formulaire')}
              </button>

              <button
                onClick={() => {
                  setWizardFinished(true);
                  if (onComplete) {
                    onComplete();
                  } else {
                    setLocation('/members');
                    toast({ title: t('activities.toast.validated_title', 'Questionnaire Validé'), description: t('activities.toast.validated_desc', 'Le questionnaire de l\'activité a été validé et finalisé.') });
                  }
                }}
                className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-1.5"
              >
                {t('common.validate_and_finish', 'Valider & Terminer')} <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {wizardFinished && (
          <div className="border-t pt-6 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center mx-auto">
              <Check className="h-6 w-6" />
            </div>
            <div>
              <h4 className="font-semibold text-lg text-foreground">{t('activities.success_title', 'Activité enregistrée avec succès !')}</h4>
              <p className="text-sm text-muted-foreground mt-1">{t('activities.success_subtitle', 'Souhaitez-vous ajouter une autre activité ou retourner au menu principal ?')}</p>
            </div>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => {
                  setStep(1);
                  setWizardFinished(false);
                }}
                className="border border-input bg-background hover:bg-muted text-sm font-semibold px-4 py-2 rounded-md"
              >
                {t('activities.add_secondary_activity', 'Saisir une activité secondaire')}
              </button>
              <button
                onClick={() => {
                  setLocation('/members');
                }}
                className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-md hover:bg-primary/90"
              >
                {t('activities.return_to_main_menu', 'Retourner au Menu Principal')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
