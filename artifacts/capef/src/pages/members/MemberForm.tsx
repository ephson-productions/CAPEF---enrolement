import React, { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useListRegions, useListDepartments, useListArrondissements } from '@workspace/api-client-react';
import type { Member } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import {
  User as UserIcon, Building2, MapPin, Tractor, Droplets, Trees, Hammer, CheckCircle2, ChevronRight, ChevronLeft, Save
} from 'lucide-react';

export const formSchema = z.object({
  memberType: z.enum(['physique', 'morale']),
  category: z.enum(['agriculteur', 'pecheur', 'eleveur', 'forestier', 'artisan']),
  regionId: z.coerce.number().optional().nullable(),
  departmentId: z.coerce.number().optional().nullable(),
  arrondissementId: z.coerce.number().optional().nullable(),
  village: z.string().optional().nullable(),
  gpsLat: z.coerce.number().optional().nullable(),
  gpsLng: z.coerce.number().optional().nullable(),

  physiqueData: z.object({
    civilite: z.string().optional(),
    nom: z.string().min(1, 'Le nom est requis'),
    prenom: z.string().optional(),
    sexe: z.string().optional(),
    telephone1: z.string().optional(),
    numeroCni: z.string().optional(),
    niveauEtudes: z.string().optional(),
  }).optional(),

  moraleData: z.object({
    typeOrganisation: z.string().optional(),
    nom: z.string().min(1, "Le nom de l'organisation est requis"),
    numeroImmatriculation: z.string().optional(),
    telephone1: z.string().optional(),
  }).optional(),

  categoryData: z.any().optional(),
});

export type MemberFormValues = z.infer<typeof formSchema>;

function toDefaultValues(member?: Member): MemberFormValues {
  if (!member) {
    return {
      memberType: 'physique',
      category: 'agriculteur',
      physiqueData: { nom: '', prenom: '' },
      moraleData: { nom: '' },
    };
  }
  return {
    memberType: member.memberType as 'physique' | 'morale',
    category: member.category as MemberFormValues['category'],
    regionId: member.regionId ?? null,
    departmentId: member.departmentId ?? null,
    arrondissementId: member.arrondissementId ?? null,
    village: member.village ?? '',
    gpsLat: member.gpsLat ?? null,
    gpsLng: member.gpsLng ?? null,
    physiqueData: (member.physiqueData as any) ?? { nom: '', prenom: '' },
    moraleData: (member.moraleData as any) ?? { nom: '' },
    categoryData: member.categoryData ?? {},
  };
}

type MemberFormProps = {
  member?: Member;
  isSubmitting: boolean;
  onSubmit: (values: MemberFormValues) => void | Promise<void>;
  submitLabel?: string;
};

export default function MemberForm({ member, isSubmitting, onSubmit, submitLabel }: MemberFormProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const methods = useForm<MemberFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toDefaultValues(member),
  });

  const { watch, setValue, handleSubmit, formState: { errors }, reset } = methods;

  useEffect(() => {
    if (member) {
      reset(toDefaultValues(member));
    }
  }, [member, reset]);

  const memberType = watch('memberType');
  const category = watch('category');

  const regions = useListRegions();
  const selectedRegion = watch('regionId');
  const departments = useListDepartments(
    { regionId: selectedRegion as number },
    { query: { enabled: !!selectedRegion, queryKey: ['departments', selectedRegion] } }
  );
  const selectedDept = watch('departmentId');
  const arrondissements = useListArrondissements(
    { departmentId: selectedDept as number },
    { query: { enabled: !!selectedDept, queryKey: ['arrondissements', selectedDept] } }
  );

  const getGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setValue('gpsLat', pos.coords.latitude);
        setValue('gpsLng', pos.coords.longitude);
        toast({ title: 'GPS Capturé', description: 'Coordonnées enregistrées avec succès.' });
      }, () => {
        toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible d\'obtenir la position.' });
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Stepper Header */}
      <div className="flex items-center mb-8 overflow-x-auto pb-2">
        {[
          { num: 1, title: 'Type & Catégorie' },
          { num: 2, title: 'Identité' },
          { num: 3, title: 'Localisation' },
          { num: 4, title: 'Détails Pro.' },
        ].map((s, idx) => (
          <React.Fragment key={s.num}>
            <div className={`flex items-center gap-2 shrink-0 ${step >= s.num ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm border-2 
                ${step > s.num ? 'bg-primary border-primary text-primary-foreground' : step === s.num ? 'border-primary text-primary' : 'border-muted-foreground text-muted-foreground'}`}>
                {step > s.num ? <CheckCircle2 className="h-5 w-5" /> : s.num}
              </div>
              <span className="font-medium hidden sm:inline">{s.title}</span>
            </div>
            {idx < 3 && <div className={`h-1 w-12 mx-2 rounded-full ${step > s.num ? 'bg-primary' : 'bg-muted'}`} />}
          </React.Fragment>
        ))}
      </div>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 md:p-8">

            {/* STEP 1: TYPE & CATEGORY */}
            {step === 1 && (
              <div className="space-y-8 animate-in fade-in">
                <div>
                  <h3 className="text-lg font-bold mb-4">Type de membre</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className={`cursor-pointer rounded-lg border-2 p-4 flex items-center gap-4 transition-all ${memberType === 'physique' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                      <input type="radio" value="physique" {...methods.register('memberType')} className="sr-only" />
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${memberType === 'physique' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                        <UserIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-bold text-foreground">Personne Physique</div>
                        <div className="text-sm text-muted-foreground">Individu, exploitant indépendant</div>
                      </div>
                    </label>
                    <label className={`cursor-pointer rounded-lg border-2 p-4 flex items-center gap-4 transition-all ${memberType === 'morale' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                      <input type="radio" value="morale" {...methods.register('memberType')} className="sr-only" />
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${memberType === 'morale' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-bold text-foreground">Personne Morale</div>
                        <div className="text-sm text-muted-foreground">GIC, Coopérative, Entreprise</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold mb-4">Catégorie d'activité principale</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { id: 'agriculteur', label: 'Agriculteur', icon: Tractor, color: 'text-green-600' },
                      { id: 'pecheur', label: 'Pêcheur / Aquaculteur', icon: Droplets, color: 'text-blue-500' },
                      { id: 'eleveur', label: 'Éleveur', icon: Building2, color: 'text-orange-500' },
                      { id: 'forestier', label: 'Exploitant Forestier', icon: Trees, color: 'text-emerald-700' },
                      { id: 'artisan', label: 'Artisan', icon: Hammer, color: 'text-purple-500' },
                    ].map(cat => (
                      <label key={cat.id} className={`cursor-pointer rounded-lg border-2 p-4 flex flex-col items-center justify-center gap-2 text-center transition-all ${category === cat.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                        <input type="radio" value={cat.id} {...methods.register('category')} className="sr-only" />
                        <cat.icon className={`h-8 w-8 ${cat.color}`} />
                        <span className="font-bold text-foreground">{cat.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: IDENTITY */}
            {step === 2 && memberType === 'physique' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Civilité</label>
                    <select {...methods.register('physiqueData.civilite')} className="w-full px-3 py-2 border border-input rounded-md">
                      <option value="M.">M.</option>
                      <option value="Mme.">Mme.</option>
                      <option value="Mlle.">Mlle.</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Nom *</label>
                    <input type="text" {...methods.register('physiqueData.nom')} className="w-full px-3 py-2 border border-input rounded-md" />
                    {errors.physiqueData?.nom && <p className="text-red-500 text-xs">{errors.physiqueData.nom.message as string}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Prénom</label>
                    <input type="text" {...methods.register('physiqueData.prenom')} className="w-full px-3 py-2 border border-input rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Sexe</label>
                    <select {...methods.register('physiqueData.sexe')} className="w-full px-3 py-2 border border-input rounded-md">
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Téléphone Principal</label>
                    <input type="tel" {...methods.register('physiqueData.telephone1')} className="w-full px-3 py-2 border border-input rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">N° CNI</label>
                    <input type="text" {...methods.register('physiqueData.numeroCni')} className="w-full px-3 py-2 border border-input rounded-md" />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && memberType === 'morale' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Type d'organisation</label>
                    <select {...methods.register('moraleData.typeOrganisation')} className="w-full px-3 py-2 border border-input rounded-md">
                      <option value="GIC">GIC</option>
                      <option value="COOP OHADA">COOP OHADA</option>
                      <option value="Entreprise">Entreprise</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Nom de l'organisation *</label>
                    <input type="text" {...methods.register('moraleData.nom')} className="w-full px-3 py-2 border border-input rounded-md" />
                    {errors.moraleData?.nom && <p className="text-red-500 text-xs">{errors.moraleData.nom.message as string}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">N° Immatriculation</label>
                    <input type="text" {...methods.register('moraleData.numeroImmatriculation')} className="w-full px-3 py-2 border border-input rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Téléphone</label>
                    <input type="tel" {...methods.register('moraleData.telephone1')} className="w-full px-3 py-2 border border-input rounded-md" />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: LOCATION */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Région</label>
                    <select {...methods.register('regionId')} className="w-full px-3 py-2 border border-input rounded-md">
                      <option value="">Sélectionnez...</option>
                      {regions.data?.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Département</label>
                    <select {...methods.register('departmentId')} disabled={!selectedRegion} className="w-full px-3 py-2 border border-input rounded-md disabled:bg-muted">
                      <option value="">Sélectionnez...</option>
                      {departments.data?.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Arrondissement</label>
                    <select {...methods.register('arrondissementId')} disabled={!selectedDept} className="w-full px-3 py-2 border border-input rounded-md disabled:bg-muted">
                      <option value="">Sélectionnez...</option>
                      {arrondissements.data?.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Village / Quartier</label>
                    <input type="text" {...methods.register('village')} className="w-full px-3 py-2 border border-input rounded-md" />
                  </div>
                </div>

                <div className="p-4 bg-muted/20 border border-border rounded-lg">
                  <h4 className="font-semibold flex items-center gap-2 mb-2"><MapPin className="h-4 w-4" /> Coordonnées GPS</h4>
                  <div className="flex gap-4 items-center">
                    <button type="button" onClick={getGPS} className="px-4 py-2 bg-secondary text-secondary-foreground font-semibold rounded hover:bg-secondary/90 transition-colors">
                      Capturer la position
                    </button>
                    <div className="text-sm text-muted-foreground">
                      Lat: {watch('gpsLat') || '---'} | Lng: {watch('gpsLng') || '---'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: CATEGORY DATA */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in">
                <p className="text-muted-foreground mb-6">Saisissez les informations spécifiques à l'activité de l'acteur.</p>

                {category === 'agriculteur' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Superficie totale exploitée (ha)</label>
                      <input type="number" step="0.01" {...methods.register('categoryData.superficie')} className="w-full md:w-1/2 px-3 py-2 border border-input rounded-md" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Cultures principales</label>
                      <input type="text" placeholder="Ex: Cacao, Maïs..." {...methods.register('categoryData.cultures')} className="w-full px-3 py-2 border border-input rounded-md" />
                    </div>
                  </div>
                )}

                {category === 'eleveur' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Types d'élevage</label>
                      <input type="text" placeholder="Ex: Volailles, Bovins..." {...methods.register('categoryData.types')} className="w-full px-3 py-2 border border-input rounded-md" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Taille du cheptel estimée</label>
                      <input type="number" {...methods.register('categoryData.taille')} className="w-full md:w-1/2 px-3 py-2 border border-input rounded-md" />
                    </div>
                  </div>
                )}

                {/* Fallback for others */}
                {['pecheur', 'forestier', 'artisan'].includes(category) && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Description de l'activité</label>
                      <textarea rows={4} {...methods.register('categoryData.description')} className="w-full px-3 py-2 border border-input rounded-md"></textarea>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          <div className="p-4 border-t border-border bg-muted/10 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(s => Math.max(1, s - 1))}
              className={`px-4 py-2 font-semibold rounded-md flex items-center gap-2 ${step === 1 ? 'invisible' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <ChevronLeft className="h-4 w-4" /> Retour
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(s => Math.min(4, s + 1))}
                className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-md shadow flex items-center gap-2 hover:bg-primary/90"
              >
                Suivant <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-md shadow flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Enregistrement...' : <><Save className="h-4 w-4" /> {submitLabel || 'Terminer'}</>}
              </button>
            )}
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
