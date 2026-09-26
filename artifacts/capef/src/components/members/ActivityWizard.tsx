import React, { useState, useEffect } from 'react';
import {
  useCreateMemberActivity,
  useUpdateMemberActivity,
  useCreateActivityLineItem,
  useDeleteActivityLineItem,
  useListMemberActivities,
  useGetMember,
} from '@workspace/api-client-react';
import { validateLineItem } from '@workspace/activity-rules';
import {
  useOfflineFallbackRegions,
  useOfflineFallbackDepartments,
  useOfflineFallbackArrondissements,
} from '@/lib/offline-hooks';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCategoryLabel, getOptionLabel } from '@/lib/i18n-helpers';
import { ACTIVITY_OPTIONS, OptionGroup } from '@/lib/activity-options';
import { AgricultureForm } from './AgricultureForm';
import { FisheriesForm } from './FisheriesForm';
import { LivestockForm } from './LivestockForm';
import { ForestryForm } from './ForestryForm';
import { CraftForm } from './CraftForm';
import { ActivityLineItemsTable } from './ActivityLineItemsTable';

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
        queryKey: ['departments', { regionId: selectedReg }],
      },
    }
  );

  const [selectedDept, setSelectedDept] = useState<number | null>(null);

  const { data: arrondissements } = useOfflineFallbackArrondissements(
    { departmentId: selectedDept || undefined },
    {
      query: {
        enabled: !!selectedDept,
        queryKey: ['arrondissements', { departmentId: selectedDept }],
      },
    }
  );

  const [selectedArr, setSelectedArr] = useState<number | null>(null);
  const [village, setVillage] = useState('');

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<'agriculteur' | 'pecheur' | 'eleveur' | 'forestier' | 'artisan'>('agriculteur');
  const [selectedMaillons, setSelectedMaillons] = useState<string[]>([]);

  // Current line item payload from active category form
  const [currentLinePayload, setCurrentLinePayload] = useState<any | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Hooks
  const createActivity = useCreateMemberActivity();
  const updateActivity = useUpdateMemberActivity();
  const createLineItem = useCreateActivityLineItem();
  const deleteLineItem = useDeleteActivityLineItem();

  // Active activity for current selected type
  const activeActivity = activities?.find((act) => act.activityType === selectedType);

  // Sync member category on initial load
  useEffect(() => {
    if (member) {
      setSelectedType(member.category as any);
      setSelectedReg(member.regionId || null);
      setSelectedDept(member.departmentId || null);
      setSelectedArr(member.arrondissementId || null);
      setVillage(member.village || '');
    }
  }, [member]);

  // Rehydrate or reset step 1 fields when selectedType changes
  useEffect(() => {
    setValidationErrors({});
    setCurrentLinePayload(null);

    if (activeActivity) {
      setSelectedReg(activeActivity.regionId || member?.regionId || null);
      setSelectedDept(activeActivity.departmentId || member?.departmentId || null);
      setSelectedArr(activeActivity.arrondissementId || member?.arrondissementId || null);
      setVillage(activeActivity.village || member?.village || '');
      setSelectedMaillons(Array.isArray(activeActivity.maillons) ? (activeActivity.maillons as string[]) : []);
    } else {
      setSelectedReg(member?.regionId || null);
      setSelectedDept(member?.departmentId || null);
      setSelectedArr(member?.arrondissementId || null);
      setVillage(member?.village || '');
      setSelectedMaillons([]);
    }
  }, [selectedType, activeActivity]);

  const handleNextFromStep1 = async () => {
    try {
      const payload = {
        activityType: selectedType,
        isPrimary: member?.category === selectedType,
        regionId: selectedReg,
        departmentId: selectedDept,
        arrondissementId: selectedArr,
        village,
        maillons: selectedMaillons,
      };

      if (activeActivity) {
        await updateActivity.mutateAsync({
          id: memberId,
          activityId: activeActivity.id,
          data: payload,
        });
      } else {
        await createActivity.mutateAsync({
          id: memberId,
          data: payload,
        });
      }
      await refetchActivities();
      setStep(2);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('common.error', 'Erreur'),
        description: t('activities.toast.create_failed', 'Échec de l\'enregistrement de la localisation/maillons.'),
      });
    }
  };

  const validateAndBuildLine = (): { valid: boolean; payload: any | null } => {
    if (!currentLinePayload) {
      toast({
        variant: 'destructive',
        title: t('common.error', 'Erreur de validation'),
        description: t('activities.toast.validation_error', 'Veuillez remplir les champs obligatoires du formulaire.'),
      });
      return { valid: false, payload: null };
    }

    const errorsList = validateLineItem(selectedType, currentLinePayload);
    if (errorsList.length > 0) {
      const errMap: Record<string, string> = {};
      errorsList.forEach((e: any) => {
        const fieldKey = e.field;
        const msgKey = `activities.validation.${e.code}`;
        errMap[fieldKey] = t(msgKey, 'Valeur requise ou invalide');
      });
      setValidationErrors(errMap);
      toast({
        variant: 'destructive',
        title: t('common.error', 'Erreur de validation'),
        description: t('activities.toast.validation_error', 'Veuillez corriger les champs requis.'),
      });
      return { valid: false, payload: null };
    }

    setValidationErrors({});
    return { valid: true, payload: currentLinePayload };
  };

  const handleAddLineItem = async (): Promise<boolean> => {
    if (!activeActivity) return false;

    const { valid, payload } = validateAndBuildLine();
    if (!valid || !payload) {
      return false;
    }

    try {
      await createLineItem.mutateAsync({
        id: memberId,
        activityId: activeActivity.id,
        data: payload,
      });
      await refetchActivities();
      setCurrentLinePayload(null);
      setValidationErrors({});
      toast({
        title: t('common.success', 'Succès'),
        description: t('activities.toast.line_added', 'Ligne ajoutée avec succès.'),
      });
      return true;
    } catch (err: any) {
      const serverMsg = err?.data?.error || err?.message;
      toast({
        variant: 'destructive',
        title: t('common.error', 'Erreur'),
        description: serverMsg || t('activities.toast.add_line_failed', 'Échec de l\'ajout de la ligne.'),
      });
      return false;
    }
  };

  const handleNextFromStep2 = async () => {
    if (currentLinePayload) {
      const added = await handleAddLineItem();
      if (!added) {
        return;
      }
    }
    setStep(3);
  };

  const handleDeleteLine = async (itemId: number) => {
    if (!activeActivity) return;
    try {
      await deleteLineItem.mutateAsync({
        id: memberId,
        activityId: activeActivity.id,
        itemId,
      });
      await refetchActivities();
      toast({ title: t('common.success', 'Succès'), description: t('activities.toast.line_deleted', 'Ligne supprimée.') });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('common.error', 'Erreur'),
        description: t('activities.toast.delete_failed', 'Échec de la suppression.'),
      });
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
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('activities.member_id', 'Enrôlement ID:')} {member?.memberNumber}
          </p>
        </div>
        <button
          onClick={() => {
            setLocation('/members');
            toast({
              title: t('common.saved', 'Enregistré'),
              description: t('activities.toast.left_wizard', 'Vous avez quitté le questionnaire. Les données saisies ont été conservées.'),
            });
          }}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-input rounded-md px-3 py-1.5 bg-background transition-colors"
        >
          {t('activities.quit_and_return', 'Quitter & Retour au Menu')}
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Stepper progress indicator */}
        <div className="flex items-center justify-center gap-2">
          {[
            t('activities.steps.step1', '1. Localisation & Type'),
            t('activities.steps.step2', '2. Questionnaire'),
            t('activities.steps.step3', '3. Récapitulatif'),
          ].map((lbl, idx) => (
            <React.Fragment key={idx}>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === idx + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {idx + 1}
                </div>
                <span
                  className={`text-sm ${
                    step === idx + 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {lbl}
                </span>
              </div>
              {idx < 2 && <div className="w-12 h-0.5 bg-border" />}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">
              {t('activities.step1_title', 'Étape 1 : Localisation spécifique de l\'activité')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('activities.category_label', 'Catégorie d\'activité')}
                </label>
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
                  {regions?.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
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
                  {departments?.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('members.filters.arrondissement', 'Arrondissement')}
                </label>
                <select
                  value={selectedArr || ''}
                  disabled={!selectedDept}
                  onChange={(e) => setSelectedArr(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="w-full border border-input rounded-md p-2 bg-background text-foreground text-sm disabled:bg-muted"
                >
                  <option value="">{t('common.select_arrondissement', 'Sélectionner un arrondissement')}</option>
                  {arrondissements?.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">
                  {t('activities.village_label', 'Village / Quartier de l\'exploitation')}
                </label>
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
              <label className="block text-sm font-medium">
                {t('activities.maillons_label', 'Maillons dans la filière (Sélection multiple)')}
              </label>
              <div className="grid grid-cols-2 gap-2 border border-border p-3 rounded-md bg-muted/20">
                {currentMaillonOptions.map((mOpt) => (
                  <label key={mOpt.value} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedMaillons.includes(mOpt.value)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMaillons([...selectedMaillons, mOpt.value]);
                        else setSelectedMaillons(selectedMaillons.filter((x) => x !== mOpt.value));
                      }}
                    />
                    {getOptionLabel(maillonGroup, mOpt.value, t)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={handleNextFromStep1}
                className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-2 text-sm"
              >
                {t('common.next', 'Suivant')} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">
              {t('activities.step2_title', 'Étape 2 : Détails de la production')} ({getCategoryLabel(selectedType, t)})
            </h3>

            {selectedType === 'agriculteur' && (
              <AgricultureForm
                existingItems={activeActivity?.lineItems || []}
                onPayloadChange={setCurrentLinePayload}
                errors={validationErrors}
              />
            )}

            {selectedType === 'pecheur' && (
              <FisheriesForm onPayloadChange={setCurrentLinePayload} errors={validationErrors} />
            )}

            {selectedType === 'eleveur' && (
              <LivestockForm onPayloadChange={setCurrentLinePayload} errors={validationErrors} />
            )}

            {selectedType === 'forestier' && (
              <ForestryForm onPayloadChange={setCurrentLinePayload} errors={validationErrors} />
            )}

            {selectedType === 'artisan' && (
              <CraftForm onPayloadChange={setCurrentLinePayload} errors={validationErrors} />
            )}

            {/* Existing lines preview in step 2 */}
            {activeActivity?.lineItems && activeActivity.lineItems.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <h4 className="font-semibold text-sm mb-2 text-foreground">
                  {t('activities.lines_already_added', 'Lignes déjà ajoutées pour cette activité')} ({activeActivity.lineItems.length})
                </h4>
                <ActivityLineItemsTable
                  activityType={selectedType}
                  items={activeActivity.lineItems}
                  onDeleteLine={handleDeleteLine}
                  isDeleting={deleteLineItem.isPending}
                />
              </div>
            )}

            <div className="flex gap-4 pt-4 border-t border-border justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="border border-input bg-background hover:bg-muted font-semibold px-4 py-2 rounded-md flex items-center gap-2 text-sm"
              >
                <ArrowLeft className="h-4 w-4" /> {t('common.previous', 'Précédent')}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAddLineItem()}
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
                  type="button"
                  onClick={handleNextFromStep2}
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
            <h3 className="text-lg font-semibold border-b pb-2">
              {t('activities.step3_title', 'Étape 3 : Récapitulatif de la saisie')}
            </h3>

            <ActivityLineItemsTable
              activityType={selectedType}
              items={activeActivity?.lineItems || []}
              onDeleteLine={handleDeleteLine}
              isDeleting={deleteLineItem.isPending}
            />

            {(!activeActivity?.lineItems || activeActivity.lineItems.length === 0) && (
              <p className="text-xs text-destructive font-medium">
                {t('activities.at_least_one_line_required', 'Vous devez enregistrer au moins une ligne d\'activité pour pouvoir valider.')}
              </p>
            )}

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-4 flex gap-3 text-sm text-yellow-900 dark:text-yellow-200">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{t('activities.tech_note_title', 'Note technique :')}</span>{' '}
                {t('activities.tech_note_text', 'Activité sauvegardée localement. Elle sera transmise lors de la reconnexion.')}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="border border-input bg-background hover:bg-muted font-semibold px-4 py-2 rounded-md flex items-center gap-2 text-sm"
              >
                <ArrowLeft className="h-4 w-4" /> {t('activities.back_to_form', 'Retour au formulaire')}
              </button>

              <button
                type="button"
                disabled={!activeActivity?.lineItems || activeActivity.lineItems.length === 0}
                onClick={() => {
                  setWizardFinished(true);
                  if (onComplete) {
                    onComplete();
                  } else {
                    setLocation('/members');
                    toast({
                      title: t('activities.toast.validated_title', 'Questionnaire Validé'),
                      description: t('activities.toast.validated_desc', 'Le questionnaire de l\'activité a été validé et finalisé.'),
                    });
                  }
                }}
                className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
              <h4 className="font-semibold text-lg text-foreground">
                {t('activities.success_title', 'Activité enregistrée avec succès !')}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                {t('activities.success_subtitle', 'Souhaitez-vous ajouter une autre activité ou retourner au menu principal ?')}
              </p>
            </div>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setWizardFinished(false);
                  setCurrentLinePayload(null);
                  setValidationErrors({});
                }}
                className="border border-input bg-background hover:bg-muted text-sm font-semibold px-4 py-2 rounded-md"
              >
                {t('activities.add_secondary_activity', 'Saisir une activité secondaire')}
              </button>
              <button
                type="button"
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
