import React, { useState, useEffect, useRef } from 'react';
import {
  useCreateMemberActivity,
  useUpdateMemberActivity,
  useCreateActivityLineItem,
  useDeleteActivityLineItem,
  useListMemberActivities,
  useGetMember
} from '@workspace/api-client-react';
import {
  useOfflineFallbackRegions,
  useOfflineFallbackDepartments,
  useOfflineFallbackArrondissements,
} from '@/lib/offline-hooks';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, Trash2, Check, AlertTriangle, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getCategoryLabel,
  getOptionLabel,
  formatLineItemTitle,
  formatLineItemSpecifics
} from '@/lib/i18n-helpers';
import { ACTIVITY_OPTIONS, OptionGroup } from '@/lib/activity-options';
import { ProductRowsEditor, ProductRow } from './activity-fields/ProductRowsEditor';
import { AreaField } from './activity-fields/AreaField';
import { ProductionFields } from './activity-fields/ProductionFields';

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
  const { data: regions } = useOfflineFallbackRegions();
  const [selectedReg, setSelectedReg] = useState<number | null>(null);

  const { data: departments } = useOfflineFallbackDepartments(
    { regionId: selectedReg || undefined },
    {
      query: {
        enabled: !!selectedReg,
        queryKey: ['departments', { regionId: selectedReg }]
      }
    }
  );

  const [selectedDept, setSelectedDept] = useState<number | null>(null);

  const { data: arrondissements } = useOfflineFallbackArrondissements(
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
  const updateActivity = useUpdateMemberActivity();
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
  const [elevageProducts, setElevageProducts] = useState<Array<{ name: string; quantity: number; unit: string; fcfa: number }>>([]);

  // Forêts
  const [foretSub, setForetSub] = useState<'exploité' | 'cultivé' | 'faune' | 'non-ligneux'>('exploité');
  const [essence, setEssence] = useState('');
  const [plantationType, setPlantationType] = useState('Monospécifique');
  const [forestryProducts, setForestryProducts] = useState<ProductRow[]>([]);

  // Artisanat
  const [artProd, setArtProd] = useState('');
  const [rawMat, setRawMat] = useState('');
  const [lineItemErrors, setLineItemErrors] = useState<Record<string, string>>({});
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const productEditorRef = useRef<HTMLDivElement | null>(null);

  // Find active activity of the current selected type for this member if exists
  const activeActivity = activities?.find(act => act.activityType === selectedType);

  const handleNextStep = async () => {
    if (step === 1) {
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
        } else {
          await updateActivity.mutateAsync({
            id: memberId,
            activityId: activeActivity.id,
            data: {
              activityType: selectedType,
              isPrimary: activeActivity.isPrimary,
              regionId: selectedReg,
              departmentId: selectedDept,
              arrondissementId: selectedArr,
              village,
              maillons: selectedMaillons,
            },
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
      const errors: Record<string, string> = {};
      const numberError = (value: string, field: string) => {
        if (value.trim() === '') {
          errors[field] = t('activities.validation.required', 'Ce champ est requis');
        } else if (!Number.isFinite(Number(value)) || Number(value) < 0) {
          errors[field] = t('activities.validation.must_be_zero_or_positive', 'La valeur doit être supérieure ou égale à 0');
        }
      };
      const requiredString = (value: string, field: string) => {
        if (!value.trim()) errors[field] = t('activities.validation.required', 'Ce champ est requis');
      };

      if (selectedType === 'agriculteur') {
        requiredString(cropCategory, 'cropCategory');
        requiredString(cropName, 'cropName');
        numberError(superficieHa, 'superficieHa');
        numberError(prodQuantity, 'productionQuantity');
        requiredString(prodUnit, 'productionUnit');
        numberError(prodFcfa, 'productionFcfa');
        const isDuplicate = activeActivity.lineItems?.some(
          item => item.cropName?.toLowerCase() === cropName.toLowerCase()
        );
        if (isDuplicate) {
          errors.cropName = t('activities.toast.duplicate_crop', 'Cette culture a déjà été ajoutée pour ce membre.');
        } else {
          payload.cropCategory = cropCategory;
          payload.cropName = cropName;
          payload.cultureType = cultureType;
          payload.superficieHa = parseFloat(superficieHa);
          payload.productionQuantity = parseFloat(prodQuantity);
          payload.productionUnit = prodUnit.trim();
          payload.productionFcfa = parseFloat(prodFcfa);
        }
      }
      else if (selectedType === 'pecheur') {
        requiredString(pesceSpecies, 'speciesPêche');
        numberError(superficieHa, 'superficieHa');
        numberError(prodQuantity, 'productionQuantity');
        requiredString(prodUnit, 'productionUnit');
        numberError(prodFcfa, 'productionFcfa');
        payload.speciesPêche = pesceSpecies;
        payload.superficieHa = parseFloat(superficieHa);
        payload.productionQuantity = parseFloat(prodQuantity);
        payload.productionUnit = prodUnit.trim();
        payload.productionFcfa = parseFloat(prodFcfa);
      }
      else if (selectedType === 'eleveur') {
        requiredString(species, 'species');
        numberError(cheptelSize, 'cheptelSize');
        numberError(superficieHa, 'superficieHa');
        if (elevageProducts.length === 0) {
          errors.products = t('activities.validation.min_one_product_row', 'Au moins une ligne produit est requise');
        }
        payload.species = species;
        payload.cheptelSize = parseInt(cheptelSize, 10);
        payload.foodType = foodType || null;
        payload.superficieHa = parseFloat(superficieHa);
        payload.products = elevageProducts;
        payload.productionQuantity = null;
        payload.productionUnit = null;
        payload.productionFcfa = elevageProducts.reduce((sum, product) => sum + product.fcfa, 0);
      }
      else if (selectedType === 'forestier') {
        requiredString(essence, 'essence');
        numberError(superficieHa, 'superficieHa');
        if (forestryProducts.length === 0) {
          errors.products = t('activities.validation.min_one_product_row', 'Au moins une ligne produit est requise');
        }
        payload.subCategory = foretSub;
        payload.essence = essence;
        payload.plantationType = foretSub === 'cultivé' ? plantationType : null;
        payload.superficieHa = parseFloat(superficieHa);
        payload.products = forestryProducts;
        payload.productionQuantity = null;
        payload.productionUnit = null;
        payload.productionFcfa = forestryProducts.reduce((sum, product) => sum + product.fcfa, 0);
      }
      else if (selectedType === 'artisan') {
        requiredString(artProd, 'artisanatProducts');
        requiredString(rawMat, 'rawMaterials');
        numberError(superficieHa, 'superficieHa');
        numberError(prodQuantity, 'productionQuantity');
        requiredString(prodUnit, 'productionUnit');
        numberError(prodFcfa, 'productionFcfa');
        payload.artisanatProducts = artProd;
        payload.rawMaterials = rawMat;
        payload.superficieHa = parseFloat(superficieHa);
        payload.productionQuantity = parseFloat(prodQuantity);
        payload.productionUnit = prodUnit.trim();
        payload.productionFcfa = parseFloat(prodFcfa);
      }

      setLineItemErrors(errors);
      if (Object.keys(errors).length > 0) {
        toast({
          variant: 'destructive',
          title: t('activities.toast.invalid_form', 'Formulaire invalide'),
          description: t('activities.toast.invalid_form', 'Formulaire invalide'),
        });
        const firstField = Object.keys(errors)[0];
        if (firstField === 'products') {
          (productEditorRef.current?.querySelector('select, input') as HTMLElement | null)?.focus();
        } else {
          fieldRefs.current[firstField]?.focus();
        }
        return;
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
      setForestryProducts([]);
      setEssence('');
      setArtProd('');
      setRawMat('');
      setLineItemErrors({});

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

  const maillonGroup = `maillons_${selectedType}` as OptionGroup;
  const currentMaillonOptions = ACTIVITY_OPTIONS[maillonGroup] || [];

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
                  className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                >
                  <option value="agriculteur">{getCategoryLabel('agriculteur', t)}</option>
                  <option value="pecheur">{getCategoryLabel('pecheur', t)}</option>
                  <option value="eleveur">{getCategoryLabel('eleveur', t)}</option>
                  <option value="forestier">{getCategoryLabel('forestier', t)}</option>
                  <option value="artisan">{getCategoryLabel('artisan', t)}</option>
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
                  className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                >
                  <option value="">{t('common.select_region', 'Sélectionner une région')}</option>
                  {regions?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
                  className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm disabled:bg-muted"
                >
                  <option value="">{t('common.select_department', 'Sélectionner un département')}</option>
                  {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('members.filters.arrondissement', 'Arrondissement')}</label>
                <select
                  value={selectedArr || ''}
                  disabled={!selectedDept}
                  onChange={(e) => setSelectedArr(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm disabled:bg-muted"
                >
                  <option value="">{t('common.select_arrondissement', 'Sélectionner un arrondissement')}</option>
                  {arrondissements?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">{t('activities.village_label', 'Village / Quartier de l\'exploitation')}</label>
                <input
                  type="text"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder={t('activities.village_placeholder', 'Nom du village ou quartier')}
                  className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                />
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <label className="block text-sm font-medium">{t('activities.maillons_label', 'Maillons dans la filière (Sélection multiple)')}</label>
              <div className="grid grid-cols-2 gap-2 border border-border p-3 rounded-md bg-muted/20">
                {currentMaillonOptions.map((mOpt) => (
                  <label key={mOpt.value} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedMaillons.includes(mOpt.value)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMaillons([...selectedMaillons, mOpt.value]);
                        else setSelectedMaillons(selectedMaillons.filter(x => x !== mOpt.value));
                      }}
                    />
                    {getOptionLabel(maillonGroup, mOpt.value, t)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleNextStep}
                className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-2 text-sm"
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
                    ref={(element) => { fieldRefs.current.cropCategory = element; }}
                    className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {ACTIVITY_OPTIONS.crop_category.map(opt => (
                      <option key={opt.value} value={opt.value}>{getOptionLabel('crop_category', opt.value, t)}</option>
                    ))}
                  </select>
                  {lineItemErrors.cropCategory && <p className="text-xs text-destructive mt-1">{lineItemErrors.cropCategory}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.crop_name', 'Culture précise')}</label>
                  <input
                    type="text"
                    value={cropName}
                    onChange={(e) => setCropName(e.target.value)}
                    ref={(element) => { fieldRefs.current.cropName = element; }}
                    placeholder={t('activities.crop_placeholder', 'Ex: Maïs, Manioc...')}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.cropName ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.cropName && <p className="text-xs text-destructive mt-1">{lineItemErrors.cropName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.culture_type', 'Type de culture')}</label>
                  <select
                    value={cultureType}
                    onChange={(e) => setCultureType(e.target.value)}
                    className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                  >
                    {ACTIVITY_OPTIONS.culture_type.map(opt => (
                      <option key={opt.value} value={opt.value}>{getOptionLabel('culture_type', opt.value, t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.superficie', 'Superficie de la parcelle (ha)')}</label>
                  <input
                    type="number"
                    value={superficieHa}
                    onChange={(e) => setSuperficieHa(e.target.value)}
                    ref={(element) => { fieldRefs.current.superficieHa = element; }}
                    placeholder="Ex: 2.5"
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.superficieHa ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.superficieHa && <p className="text-xs text-destructive mt-1">{lineItemErrors.superficieHa}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_quantity', 'Production annuelle (Quantité)')}</label>
                  <input
                    type="number"
                    value={prodQuantity}
                    onChange={(e) => setProdQuantity(e.target.value)}
                    ref={(element) => { fieldRefs.current.productionQuantity = element; }}
                    placeholder="Ex: 500"
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.productionQuantity ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.productionQuantity && <p className="text-xs text-destructive mt-1">{lineItemErrors.productionQuantity}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_unit', 'Unité de production')}</label>
                  <input
                    type="text"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                    ref={(element) => { fieldRefs.current.productionUnit = element; }}
                    placeholder={t('activities.unit_placeholder', 'Ex: Tonnes, Sacs...')}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.productionUnit ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.productionUnit && <p className="text-xs text-destructive mt-1">{lineItemErrors.productionUnit}</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_fcfa', 'Valeur de la production (FCFA)')}</label>
                  <input
                    type="number"
                    value={prodFcfa}
                    onChange={(e) => setProdFcfa(e.target.value)}
                    ref={(element) => { fieldRefs.current.productionFcfa = element; }}
                    placeholder="Ex: 1500000"
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.productionFcfa ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.productionFcfa && <p className="text-xs text-destructive mt-1">{lineItemErrors.productionFcfa}</p>}
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
                    ref={(element) => { fieldRefs.current.speciesPêche = element; }}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.speciesPêche ? 'border-destructive' : 'border-input'}`}
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {ACTIVITY_OPTIONS.fish_species.map(opt => (
                      <option key={opt.value} value={opt.value}>{getOptionLabel('fish_species', opt.value, t)}</option>
                    ))}
                  </select>
                  {lineItemErrors.speciesPêche && <p className="text-xs text-destructive mt-1">{lineItemErrors.speciesPêche}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.fisheries.area_ha_label', "Superficie du site d'aquaculture (ha)")} <span className="text-destructive">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={superficieHa}
                    onChange={(e) => setSuperficieHa(e.target.value)}
                    ref={(element) => { fieldRefs.current.superficieHa = element; }}
                    placeholder="Ex: 0.5"
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.superficieHa ? 'border-destructive' : 'border-input'}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('activities.hint_zero_if_na', 'Saisir 0 si non applicable')}</p>
                  {lineItemErrors.superficieHa && <p className="text-xs text-destructive mt-1">{lineItemErrors.superficieHa}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_quantity', 'Production annuelle (Quantité)')}</label>
                  <input
                    type="number"
                    value={prodQuantity}
                    onChange={(e) => setProdQuantity(e.target.value)}
                    ref={(element) => { fieldRefs.current.productionQuantity = element; }}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.productionQuantity ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.productionQuantity && <p className="text-xs text-destructive mt-1">{lineItemErrors.productionQuantity}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.prod_unit', 'Unité de production')}</label>
                  <input
                    type="text"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                    placeholder="Ex: kg, tonnes"
                    ref={(element) => { fieldRefs.current.productionUnit = element; }}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.productionUnit ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.productionUnit && <p className="text-xs text-destructive mt-1">{lineItemErrors.productionUnit}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.value_fcfa', 'Valeur (FCFA)')}</label>
                  <input
                    type="number"
                    value={prodFcfa}
                    onChange={(e) => setProdFcfa(e.target.value)}
                    ref={(element) => { fieldRefs.current.productionFcfa = element; }}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.productionFcfa ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.productionFcfa && <p className="text-xs text-destructive mt-1">{lineItemErrors.productionFcfa}</p>}
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
                    className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {ACTIVITY_OPTIONS.livestock_type.map(opt => (
                      <option key={opt.value} value={opt.value}>{getOptionLabel('livestock_type', opt.value, t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.species', 'Espèce élevée')}</label>
                  <input
                    type="text"
                    value={species}
                    onChange={(e) => setSpecies(e.target.value)}
                    ref={(element) => { fieldRefs.current.species = element; }}
                    placeholder="Ex: Boeufs, Poulets pondeurs..."
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.species ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.species && <p className="text-xs text-destructive mt-1">{lineItemErrors.species}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.cheptel_size', 'Taille du cheptel (Têtes)')}</label>
                  <input
                    type="number"
                    value={cheptelSize}
                    onChange={(e) => setCheptelSize(e.target.value)}
                    ref={(element) => { fieldRefs.current.cheptelSize = element; }}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.cheptelSize ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.cheptelSize && <p className="text-xs text-destructive mt-1">{lineItemErrors.cheptelSize}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.food_type', 'Type de nourriture')}</label>
                  <select
                    value={foodType}
                    onChange={(e) => setFoodType(e.target.value)}
                    className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {ACTIVITY_OPTIONS.feed_type.map(opt => (
                      <option key={opt.value} value={opt.value}>{getOptionLabel('feed_type', opt.value, t)}</option>
                    ))}
                  </select>
                </div>

                <AreaField
                  value={superficieHa}
                  onChange={setSuperficieHa}
                  inputRef={(element) => { fieldRefs.current.superficieHa = element; }}
                  labelKey="activities.livestock.area_ha_label"
                  labelFallback="Superficie de l'enclos / pâturage (ha)"
                  error={lineItemErrors.superficieHa}
                  helperText={t('activities.hint_zero_if_na', 'Saisir 0 si non applicable')}
                />
                <div className="md:col-span-2" ref={productEditorRef}>
                  <ProductRowsEditor
                    productGroup="livestock_product"
                    rows={elevageProducts}
                    onChange={setElevageProducts}
                    error={lineItemErrors.products}
                    unitOptions={ACTIVITY_OPTIONS.production_units.filter((option) =>
                      ['kg', 'L', 'unité', 'sac', 'Autre (préciser)'].includes(option.value)
                    )}
                  />
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
                    className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                  >
                    {ACTIVITY_OPTIONS.forestry_subcategory.map(opt => (
                      <option key={opt.value} value={opt.value}>{getOptionLabel('forestry_subcategory', opt.value, t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.essence', 'Essence / Espèce précise')}</label>
                  <input
                    type="text"
                    value={essence}
                    onChange={(e) => setEssence(e.target.value)}
                    ref={(element) => { fieldRefs.current.essence = element; }}
                    placeholder="Ex: Bubinga, Moringa..."
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.essence ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.essence && <p className="text-xs text-destructive mt-1">{lineItemErrors.essence}</p>}
                </div>
                {foretSub === 'cultivé' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('activities.plantation_type', 'Type de plantation')}</label>
                    <select
                      value={plantationType}
                      onChange={(e) => setPlantationType(e.target.value)}
                      className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm"
                    >
                      {ACTIVITY_OPTIONS.plantation_type.map(opt => (
                        <option key={opt.value} value={opt.value}>{getOptionLabel('plantation_type', opt.value, t)}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.superficie', 'Superficie cultivée (ha)')}</label>
                  <input
                    type="number"
                    value={superficieHa}
                    onChange={(e) => setSuperficieHa(e.target.value)}
                    ref={(element) => { fieldRefs.current.superficieHa = element; }}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.superficieHa ? 'border-destructive' : 'border-input'}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('activities.hint_zero_if_na', 'Saisir 0 si non applicable')}</p>
                  {lineItemErrors.superficieHa && <p className="text-xs text-destructive mt-1">{lineItemErrors.superficieHa}</p>}
                </div>
                <div className="md:col-span-2" ref={productEditorRef}>
                  <ProductRowsEditor
                    productGroup="forestry_product"
                    rows={forestryProducts}
                    onChange={setForestryProducts}
                    error={lineItemErrors.products}
                    unitOptions={ACTIVITY_OPTIONS.production_units.filter((option) =>
                      ['m³', 'kg', 'unité', 'Autre (préciser)'].includes(option.value)
                    )}
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
                    ref={(element) => { fieldRefs.current.artisanatProducts = element; }}
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.artisanatProducts ? 'border-destructive' : 'border-input'}`}
                  >
                    <option value="">{t('common.select', 'Sélectionner')}</option>
                    {ACTIVITY_OPTIONS.artisan_product.map(opt => (
                      <option key={opt.value} value={opt.value}>{getOptionLabel('artisan_product', opt.value, t)}</option>
                    ))}
                  </select>
                  {lineItemErrors.artisanatProducts && <p className="text-xs text-destructive mt-1">{lineItemErrors.artisanatProducts}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('activities.raw_mat', 'Matières premières utilisées')}</label>
                  <input
                    type="text"
                    value={rawMat}
                    onChange={(e) => setRawMat(e.target.value)}
                    ref={(element) => { fieldRefs.current.rawMaterials = element; }}
                    placeholder="Ex: Tronc de plantain, Tissus, Bamboo..."
                    className={`w-full border rounded-md p-2 bg-background text-foreground text-sm ${lineItemErrors.rawMaterials ? 'border-destructive' : 'border-input'}`}
                  />
                  {lineItemErrors.rawMaterials && <p className="text-xs text-destructive mt-1">{lineItemErrors.rawMaterials}</p>}
                </div>
                <div>
                  <AreaField
                    value={superficieHa}
                    onChange={setSuperficieHa}
                    inputRef={(element) => { fieldRefs.current.superficieHa = element; }}
                    unitLabel="m²"
                    labelKey="activities.craft.area_label"
                    error={lineItemErrors.superficieHa}
                    helperText={t('activities.hint_zero_if_na', 'Saisir 0 si non applicable')}
                  />
                </div>
                <div className="md:col-span-2">
                  <ProductionFields
                    quantity={prodQuantity}
                    onQuantityChange={setProdQuantity}
                    unit={prodUnit}
                    onUnitChange={setProdUnit}
                    fcfa={prodFcfa}
                    onFcfaChange={setProdFcfa}
                    errors={lineItemErrors}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4 border-t border-border justify-between">
              <button
                onClick={() => setStep(1)}
                className="border border-input bg-background hover:bg-muted font-semibold px-4 py-2 rounded-md flex items-center gap-2 text-sm"
              >
                <ArrowLeft className="h-4 w-4" /> {t('common.previous', 'Précédent')}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={handleAddLineItem}
                  disabled={createLineItem.isPending}
                  className="bg-secondary text-secondary-foreground font-semibold px-4 py-2 rounded-md hover:bg-secondary/90 flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-1.5 text-sm"
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
                        <td className="p-3 font-medium">
                          {formatLineItemTitle(item, selectedType, t)}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {formatLineItemSpecifics(item, selectedType, t)}
                        </td>
                        <td className="p-3">
                          {selectedType === 'eleveur' || selectedType === 'forestier'
                            ? '—'
                            : `${item.productionQuantity ?? '—'} ${item.productionUnit ?? ''}`}
                        </td>
                        <td className="p-3 text-right font-mono text-xs">
                          {(item.productionFcfa ?? (Array.isArray(item.products)
                            ? item.products.reduce((sum: number, product: any) => sum + (Number(product.fcfa) || 0), 0)
                            : null))?.toLocaleString() ?? '—'}
                        </td>
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

            <div className="flex justify-between pt-4 border-t border-border">
              <button
                onClick={() => setStep(2)}
                className="border border-input bg-background hover:bg-muted font-semibold px-4 py-2 rounded-md flex items-center gap-2 text-sm"
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
                className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-1.5 text-sm"
              >
                {t('common.validate_and_finish', 'Valider & Terminer')} <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {wizardFinished && (
          <div className="border-t border-border pt-6 text-center space-y-4">
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
