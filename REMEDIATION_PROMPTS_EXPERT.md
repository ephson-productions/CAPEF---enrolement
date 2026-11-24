# PROMPTS EXPERTS DE REMÉDIATION — CAPEF DIGITAL ENRÔLEMENT
**Guide d'implémentation industrielle pour Lead Software Engineers & Agents IA**
**Auteur :** Lead Full Stack Development Engineer & System Architect
**Référence Audit :** `AUDIT_RAPPORT_EXHAUSTIF.md`
**Règle d'or :** OpenAPI-First, inspection des fichiers réels, zéro faux-positif, diff non vide vérifié.

---

## SOMMAIRE DES PROMPTS DE REMÉDIATION

- [Prompt 1 — REM-SEC-001 : Déverrouillage et Sécurisation de la Vérification Publique de Badge](#prompt-1--rem-sec-001--déverrouillage-et-sécurisation-de-la-vérification-publique-de-badge)
- [Prompt 2 — REM-OFF-001 : Correction du Rôle Superviseur dans le Bootstrap Offline](#prompt-2--rem-off-001--correction-du-rôle-superviseur-dans-le-bootstrap-offline)
- [Prompt 3 — REM-API-001 : Purge et Dépréciation de l'Endpoint Legacy `/api/members/sync`](#prompt-3--rem-api-001--purge-et-dépréciation-de-lendpoint-legacy-apimemberssync)
- [Prompt 4 — REM-FE-001 : Intégration de la Navigation Directe 'Zones Assignées' dans Shell](#prompt-4--rem-fe-001--intégration-de-la-navigation-directe-zones-assignées-dans-shell)
- [Prompt 5 — REM-PERF-001 : Allègement et Externalisation du Bundle Express Backend](#prompt-5--rem-perf-001--allègement-et-externalisation-du-bundle-express-backend)
- [Prompt 6 — REM-DATA-001 : Roadmap d'Architecture Chiffrée au Repos (Capacitor + SQLCipher)](#prompt-6--rem-data-001--roadmap-darchitecture-chiffrée-au-repos-capacitor--sqlcipher)

---

## PROMPT 1 — REM-SEC-001 : Déverrouillage et Sécurisation de la Vérification Publique de Badge

```markdown
### CONTEXTE TECHNIQUE & DIAGNOSTIC
Dans `artifacts/api-server/src/routes/members.ts` (ligne 2554), l'endpoint de vérification de badge `/api/members/badge/:badgeToken` est verrouillé derrière le middleware `requireAppUser`.
Or, `lib/api-spec/openapi.yaml` documente formellement un endpoint public `/public/members/badge/{badgeToken}` destiné à permettre aux forces de l'ordre, acheteurs ou tiers de vérifier l'authenticité de la carte d'adhérent en scannant le QR code avec n'importe quel smartphone non connecté à Clerk.
De plus, `BadgeVerify.tsx` interroge actuellement `/api/members/badge/${token}` et échoue en 401 Unauthorized pour les utilisateurs non connectés.

### OBJECTIFS D'EXÉCUTION
1. **Mise en conformité OpenAPI-First :**
   - Vérifier `lib/api-spec/openapi.yaml` pour l'opération `getPublicMemberByBadgeToken` (`/public/members/badge/{badgeToken}`).
   - Définir un schéma de réponse restreint `PublicMemberVerification` qui **exclut formellement** les PII sensibles : omettre `cniRectoUrl`, `cniVersoUrl`, `cniNumber`, `gpsLat`, `gpsLng`, `createdById`, et informations d'audit interne.
   - Ne retourner que les informations strictement nécessaires à la vérification visuelle : `displayName`, `memberNumber`, `memberType`, `category`, `status`, `regionName`, `departmentName`, `arrondissementName`, `village`, `photoUrl`, `signatureUrl`, `badgeUrl`, et la liste sommaire des activités/productions.
2. **Implémentation Backend (`artifacts/api-server/src/routes/members.ts`) :**
   - Déclarer la route publique : `router.get("/public/members/badge/:badgeToken", publicRateLimiter, async (req, res) => ...)` (protégée par limitation de débit IP `publicRateLimiter`).
   - Maintenir également l'ancienne route `/members/badge/:badgeToken` en alias pour rétro-compatibilité temporaire, mais sans bloquer les scans publics.
   - Appliquer le masquage des champs sensibles avant envoi de la réponse JSON.
3. **Mise à jour Frontend (`artifacts/capef/src/pages/members/BadgeVerify.tsx`) :**
   - Mettre à jour l'appel pour cibler `/api/public/members/badge/${token}` (ou utiliser le hook généré `useGetPublicMemberByBadgeToken`).
   - S'assurer que le composant s'affiche sans exiger de session utilisateur Clerk (`<SignedOut>` ou accès direct public).
4. **Vérification et Tests :**
   - Créer un test d'intégration dans `artifacts/api-server/src/__tests__/authorization.test.ts` validant qu'une requête GET sur `/api/public/members/badge/:badgeToken` sans header d'autorisation renvoie HTTP 200 avec les données publiques projetées et HTTP 404 sur un token invalide.
   - Exécuter `pnpm --filter @workspace/api-spec run codegen` si le schéma OpenAPI a été modifié.
   - Valider `pnpm run typecheck`, les tests vitest backend et frontend, et afficher `git diff --stat`.
```

---

## PROMPT 2 — REM-OFF-001 : Correction du Rôle Superviseur dans le Bootstrap Offline

```markdown
### CONTEXTE TECHNIQUE & DIAGNOSTIC
Dans `artifacts/capef/src/lib/bootstrap-service.ts` (lignes 77-83), la logique de préchargement des membres pour le mode hors-ligne contient une faute de clé de rôle :
```typescript
if (user.role === 'agent') {
  params.set('createdById', userId);
} else if (user.role === 'superviseur' && user.regionId) {
  params.set('regionId', String(user.regionId));
}
```
Dans l'ensemble du système (schémas PostgreSQL, Clerk metadata, `auth.ts`, `MembersList.tsx`), le rôle canonical est `'supervisor'` (en anglais).
À cause de ce test `user.role === 'superviseur'`, la condition est toujours fausse, ce qui empêche le superviseur régional de filtrer ses membres par région au démarrage.

### OBJECTIFS D'EXÉCUTION
1. **Correction dans `artifacts/capef/src/lib/bootstrap-service.ts` :**
   - Corriger la condition de rôle à la ligne 80 :
     ```typescript
     } else if ((user.role === 'supervisor' || user.role === 'superviseur') && user.regionId) {
       params.set('regionId', String(user.regionId));
     }
     ```
2. **Audit des occurrences transversales :**
   - Lancer un `git grep -n "'superviseur'"` sur l'ensemble de `artifacts/` et `lib/` pour s'assurer qu'aucun autre endroit ne compare le rôle avec la chaîne française sans fallback sur `'supervisor'`.
3. **Tests Automatisés :**
   - Ajouter un test unitaire dans `artifacts/capef/src/lib/__tests__/startup-controller.test.ts` ou dans un fichier de test dédié validant que `BootstrapService.runBootstrap` applique correctement le paramètre `regionId` lorsque l'utilisateur connecté a le rôle `supervisor`.
4. **Validation :**
   - Exécuter `pnpm run typecheck` et `pnpm --filter capef test -- --run`.
   - Afficher `git diff --stat` confirmant la modification exacte.
```

---

## PROMPT 3 — REM-API-001 : Purge et Dépréciation de l'Endpoint Legacy `/api/members/sync`

```markdown
### CONTEXTE TECHNIQUE & DIAGNOSTIC
Dans `artifacts/api-server/src/routes/members.ts` (lignes 2472-2525), la route `POST /api/members/sync` subsiste dans le routeur backend.
Cet endpoint historique :
1. N'utilise pas la séquence globale PostgreSQL `seq_member_number` mais assigne temporairement `"PENDING"`, puis calcule le matricule via l'ID de la table sans transaction globale isolée.
2. Contourne le suivi d'idempotence (`processed_operations` et `X-Client-Operation-ID`).
3. Est totalement absent de `lib/api-spec/openapi.yaml` et de l'architecture offline v4 (qui fonctionne exclusivement via `MemberRepository.saveLocalMember` -> `offlineRepository.enqueue('create_member')` -> `POST /api/members`).

### OBJECTIFS D'EXÉCUTION
1. **Vérification d'Impact Frontend :**
   - Vérifier via `git grep "/members/sync"` qu'aucun composant frontend (`artifacts/capef`) ni aucun script n'invoque encore cet endpoint.
2. **Nettoyage Backend (`artifacts/api-server/src/routes/members.ts`) :**
   - Supprimer ou désactiver la route `router.post("/members/sync", ...)` afin d'empêcher toute injection de matricules non déterministes.
   - Si une rétro-compatibilité stricte est temporairement requise par la gouvernance, sécuriser la route en forçant l'utilisation de `seq_member_number` et une transaction Drizzle atomique, ou renvoyer un code `410 Gone` documenté avec redirection vers `POST /api/members`.
3. **Validation :**
   - Lancer la suite de tests backend (`cd artifacts/api-server && pnpm exec vitest run`).
   - S'assurer qu'aucun test d'intégration existant ne dépendait de cette route obsolète.
   - Valider la compilation `pnpm --filter @workspace/api-server build`.
```

---

## PROMPT 4 — REM-FE-001 : Intégration de la Navigation Directe 'Zones Assignées' dans Shell

```markdown
### CONTEXTE TECHNIQUE & DIAGNOSTIC
La page `AssignedZones.tsx` (`/profile/assigned-zones` et `/assigned-zones`) est opérationnelle et testée pour le mode offline avec multi-agent isolation. Cependant, l'accès à cette page depuis l'interface mobile et desktop est enfoui dans l'écran de profil utilisateur (`Profile.tsx`), limitant la visibilité pour les agents de terrain qui doivent régulièrement vérifier leurs arrondissements et départements d'affectation.

### OBJECTIFS D'EXÉCUTION
1. **Mise à jour de `artifacts/capef/src/components/layout/Shell.tsx` :**
   - Importer l'icône `MapPin` depuis `lucide-react`.
   - Ajouter un élément de navigation visible pour les agents et les superviseurs :
     ```typescript
     { name: t('navigation.assigned_zones', 'Zones assignées'), href: '/profile/assigned-zones', icon: MapPin },
     ```
   - Ajouter la clé de traduction correspondante dans `artifacts/capef/src/locales/fr.json` et `artifacts/capef/src/locales/en.json` sous `navigation.assigned_zones`.
2. **Vérification Visuelle & Responsive :**
   - S'assurer que le lien fonctionne aussi bien dans le tiroir mobile (`isMobileMenuOpen`) que dans la barre latérale Desktop.
   - Vérifier que l'état actif (`isActive`) s'applique correctement sur `/profile/assigned-zones` et `/assigned-zones`.
3. **Tests de Régression :**
   - Exécuter la suite `pnpm --filter capef test -- --run`.
   - Lancer `pnpm run typecheck` et `pnpm --filter capef build`.
   - Confirmer avec `git diff --stat`.
```

---

## PROMPT 5 — REM-PERF-001 : Allègement et Externalisation du Bundle Express Backend

```markdown
### CONTEXTE TECHNIQUE & DIAGNOSTIC
Le script de compilation backend `artifacts/api-server/build.mjs` produit actuellement un bundle `dist/index.mjs` de **5.7 MB** (et un sourcemap de 10.4 MB) avec un avertissement de taille esbuild.
La cause est que des bibliothèques externes lourdes comme `exceljs`, `@supabase/supabase-js`, `@clerk/express`, et `drizzle-orm` sont inlinées dans le fichier JS distribué au lieu d'être traitées comme dépendances runtime externes chargées par Node.js.

### OBJECTIFS D'EXÉCUTION
1. **Optimisation dans `artifacts/api-server/build.mjs` :**
   - Configurer la liste `external` d'esbuild pour exclure les modules lourds de production :
     ```javascript
     external: [
       '@supabase/supabase-js',
       'exceljs',
       'pg',
       'drizzle-orm',
       '@clerk/express',
       'pino',
       'pino-http'
     ],
     ```
   - Vérifier que `package.json` de `@workspace/api-server` liste correctement ces paquets dans ses `dependencies`.
2. **Build et Validation d'Exécution :**
   - Exécuter `pnpm --filter @workspace/api-server build`.
   - Constater la réduction de taille du bundle (cible : < 1 MB).
   - Lancer un test d'amorçage rapide du serveur Node.js généré (`node artifacts/api-server/dist/index.mjs`) pour vérifier qu'aucune dépendance externe n'échoue à la résolution de module CJS/ESM.
   - Exécuter la suite de tests backend (`cd artifacts/api-server && pnpm exec vitest run`).
```

---

## PROMPT 6 — REM-DATA-001 : Roadmap d'Architecture Chiffrée au Repos (Capacitor + SQLCipher)

```markdown
### CONTEXTE STRATÉGIQUE & SÉCURITÉ INSTITUTIONNELLE
Conformément au rapport de production Phase 14 (`PHASE_14_PRODUCTION_REPORT.md`), les bases IndexedDB d'une PWA web standard résident en clair sur le système de fichiers hôte de l'appareil mobile Android.
Pour garantir une confidentialité absolue des données PII enrôlées (Zero Unencrypted PII at Rest) en cas de saisie, perquisition ou vol de matériel sur le terrain, une transition vers un conteneur hybride chiffré doit être préparée.

### OBJECTIFS D'ÉVALUATION & PROOF-OF-CONCEPT
1. **Architecture Cible :**
   - Encapsulation du projet Vite React existant dans un wrapper **Capacitor 6+**.
   - Remplacement de l'adaptateur de persistance Dexie par le plugin `@capacitor-community/sqlite` intégrant le moteur **SQLCipher (AES-256-CBC)**.
2. **Gestionnaire de Clés Matérielles :**
   - Utilisation de `@capacitor/device` et du trousseau Android Keystore / iOS Keychain pour stocker la clé de déchiffrement de la base locale.
   - Clé dérivée via PBKDF2 à partir du PIN de session de l'agent sans écriture de la clé en clair sur le disque.
3. **Séparation Interface / Implémentation :**
   - Conserver l'interface TypeScript existante `IOfflineQueueRepository` et `MemberRepository` afin que les composants UI React (`MemberForm`, `ActivityWizard`, `MembersList`) demeurent strictement agnostiques du moteur de base de données sous-jacent.
4. **Livrable Attendu :**
   - Document de spécification technique d'architecture pour le déploiement mobile officiel CAPEF Android APK.
```

---
*Fin du Recueil des Prompts Experts de Remédiation.*
