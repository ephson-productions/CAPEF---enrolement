# RAPPORT D'AUDIT TECHNIQUE ET ARCHITECTURAL APPROFONDI (SANS CONCESSION)
**Projet :** CAPEF Digital Enrôlement — PWA Agropastorale Offline-First & API Server
**Rôle de l'auditeur :** Lead Full Stack Development Engineer & System Architect
**Date :** Octobre 2026
**Statut :** Strict, exhaustif, sans complaisance

---

## TABLE DES MATIÈRES

1. [Résumé Exécutif (Executive Summary)](#1-résumé-exécutif)
2. [Matrice des Risques et Sévérités (P0 à P3)](#2-matrice-des-risques-et-sévérités)
3. [Architecture Globale & Écosystème Monorepo](#3-architecture-globale--écosystème-monorepo)
4. [Audit Approfondi : Moteur Offline-First, IndexedDB & Synchronisation](#4-audit-approfondi--moteur-offline-first-indexeddb--synchronisation)
5. [Audit Sécurité, Authentification & Contrôle d'Accès (RBAC)](#5-audit-sécurité-authentification--contrôle-daccès-rbac)
6. [Audit Backend, Base de Données & Intégrité Transactionnelle](#6-audit-backend-base-de-données--intégrité-transactionnelle)
7. [Audit Frontend PWA, Performance, Rendu & Bundle Size](#7-audit-frontend-pwa-performance-rendu--bundle-size)
8. [Catalogue Détaillé des Bugs, Anti-Patterns et Dettes Techniques](#8-catalogue-détaillé-des-bugs-anti-patterns-et-dettes-techniques)
9. [Couverture des Tests & Fiabilité des Processus CI/CD](#9-couverture-des-tests--fiabilité-des-processus-cicd)
10. [Plan de Remédiation Stratégique et Recommandations](#10-plan-de-remédiation-stratégique-et-recommandations)

---

## 1. RÉSUMÉ EXÉCUTIF

Le projet CAPEF Digital Enrôlement est une solution ambitieuse conçue pour permettre le recensement et l'enrôlement des acteurs agropastoraux du Cameroun dans des conditions de connectivité intermittente ou inexistante (brousse, zones côtières, bassins forestiers).

L'audit architectural et de code mené sur l'intégralité du monorepo (Express 5, Drizzle ORM, PostgreSQL, React 18, Vite, Workbox PWA, Dexie.js v4) démontre une **architecture de base remarquablement mûre et hautement technique**, fruit des phases successives de remédiation (Phases 1 à 14). Des mécanismes rares et complexes tels que l'idempotence multi-tab par Web Locks, la réconciliation d'identifiants (`localId` vs `serverId`), le contrôle de concurrence optimiste (OCC 409) et le narrow filtering sont déjà en place.

**Cependant, sous la loupe d'un Lead Architect sans concession**, plusieurs faiblesses structurelles, dérives de conformité de contrat OpenAPI, désynchronisations de rôles et vulnérabilités de rétention de données subsistent et mettent en péril la résilience opérationnelle et la sécurité juridique en production.

### Points Forts Constatés :
- **Architecture Offline Déterministe :** Séparation irréprochable de Dexie `id` (interne), `localId` (UUID client) et `serverId` (entier Postgres). Les mutations REST n'utilisent jamais l'ID auto-incrémenté Dexie.
- **Robustesse Concurrente & Idempotence :** Suivi cryptographique SHA-256 dans `processed_operations` avec gestion atomique des replays (`X-Client-Operation-ID`), prévenant tout dédoublement en cas de flapping 3G/EDGE.
- **Règle OpenAPI-First globalement respectée :** Modélisation stricte de 95% des modèles dans `openapi.yaml` avec génération automatique Zod et hooks TanStack React Query.
- **Pipeline Médias Hybride :** Compression canvas côté client, rétention Blob IndexedDB, téléversement préalable et stockage de clés relatives avec signatures éphémères (1 heure), interdisant l'explosion de base64 dans Postgres.

### Points Faibles et Risques Majeurs :
- **Divergence de Sécurité sur la Vérification des Badges (P1) :** La spécification et le frontend décrivent un portail de vérification public pour scanner les QR codes sur les cartes physiques, or l'endpoint backend `/api/members/badge/:badgeToken` impose `requireAppUser` (session Clerk obligatoire).
- **Incohérence de Typage de Rôle dans le Bootstrap Offline (P1) :** `bootstrap-service.ts` teste `user.role === 'superviseur'` au lieu de `'supervisor'`, provoquant le téléchargement sans filtre régional des membres pour les superviseurs lors de l'initialisation offline.
- **Endpoint Fantôme Non Normalisé `/api/members/sync` (P2) :** L'endpoint de synchronisation en masse historique subsiste dans `members.ts` avec génération de matricule vulnérable aux collisions (`PENDING` + update non atomique) au lieu de la séquence globale `seq_member_number`.
- **Confidentialité PII au Repos Défaillante sur Appareil Partagé (P1) :** Les données des membres (photos CNI, signatures, identités) sont stockées en clair dans les fichiers LevelDB/SQLite du navigateur sans chiffrement matériel (Zero Unencrypted PII at Rest non atteint).
- **Bundle Backend Monolithique (P2) :** Un bundle `dist/index.mjs` de 5.7 MB généré par esbuild incluant des dépendances runtime lourdes sans externalisation propre.

---

## 2. MATRICE DES RISQUES ET SÉVÉRITÉS

| Réf. | Sévérité | Domaine | Description Vulnérabilité / Problème | Fichier & Lignes d'impact |
|---|---|---|---|---|
| **SEC-001** | **P1 (High)** | Sécurité / Accès | Vérification des badges scannés bloquée pour les tiers non authentifiés (`requireAppUser` imposé sur `/api/members/badge/:badgeToken`). | `artifacts/api-server/src/routes/members.ts:2554` |
| **OFF-001** | **P1 (High)** | Offline / Scoping | Typos de rôle `'superviseur'` vs `'supervisor'` brisant le filtrage régional lors du préchargement hors-ligne. | `artifacts/capef/src/lib/bootstrap-service.ts:80` |
| **DATA-001** | **P1 (High)** | Confidentialité | Données biométriques et CNI stockées en clair dans IndexedDB sur des terminaux mobiles Android partagés. | `artifacts/capef/src/lib/repositories/CapefDexieDatabase.ts:1-200` |
| **API-001** | **P2 (Medium)** | Cohérence API | Endpoint legacy `/members/sync` actif en base de code sans transaction unifiée et avec risque de collision matricule. | `artifacts/api-server/src/routes/members.ts:2472-2525` |
| **PERF-001**| **P2 (Medium)** | Backend Build | Bundle Express monolithique de 5.7 MB contenant `@supabase/supabase-js`, `exceljs` et dépendances transpiled. | `artifacts/api-server/build.mjs:5-30` |
| **FE-001**  | **P2 (Medium)** | UI / Navigation | Manque de navigation explicite pour 'Assigned Zones' dans le menu latéral Desktop (`Shell.tsx`). | `artifacts/capef/src/components/layout/Shell.tsx:35-40` |
| **DATA-002** | **P3 (Low)** | Intégrité Données | Absence d'index composite sur `(region_id, department_id, arrondissement_id)` pour les requêtes de filtrage lourd. | `lib/db/src/schema/members.ts:20-40` |
| **I18N-001** | **P3 (Low)** | Internationalisation | Textes hardcodés en français dans certaines fenêtres modales de confirmation et messages d'erreur système. | `artifacts/capef/src/components/offline/SyncDashboardModal.tsx` |

---

## 3. ARCHITECTURE GLOBALE & ÉCOSYSTÈME MONOREPO

### 3.1 Topologie Monorepo (pnpm workspaces)
L'arborescence est partitionnée en :
- `artifacts/capef` : Frontend Vite PWA React 18, Tailwind CSS, Radix UI.
- `artifacts/api-server` : Backend Node.js / Express 5, Drizzle ORM, Pino Logger.
- `lib/api-spec` : Spécification OpenAPI 3.0.3 YAML (`openapi.yaml`) et orchestrateur Orval.
- `lib/api-zod` : Modèles de validation de schémas Zod générés automatiquement.
- `lib/api-client-react` : Client HTTP typé TanStack React Query généré.
- `lib/db` : Schémas Drizzle, migrations incrémentales (`lib/db/drizzle/`) et pooler connection.
- `lib/activity-rules` : Matrice de complétude et validation métier des 5 filières.

### 3.2 Évaluation du Contrat OpenAPI-First
**Note d'application : 8.5/10**
Le principe "OpenAPI drives code" est respecté à 95%. Les endpoints de membres, d'activités, de lignes de production, de gestion d'utilisateurs et de dashboards sont fidèlement générés.
*Toutefois, une déviation flagrante subsiste :*
Dans `lib/api-spec/openapi.yaml`, l'opération de vérification de badge est définie sous :
```yaml
/public/members/badge/{badgeToken}:
  get:
    summary: Vérifier publiquement un badge membre par son token
    security: [] # Pas d'authentification requise
```
Alors que dans `artifacts/api-server/src/routes/members.ts` ligne 2554 :
```typescript
router.get("/members/badge/:badgeToken", requireAppUser, async (req, res) => ...
```
Le backend monte la route sur `/members/badge/:badgeToken` ET y appose le middleware `requireAppUser`. Si un policier, un douanier, un acheteur ou un partenaire scanne le QR code imprimé sur la carte consulaire avec son smartphone standard, l'API renvoie **HTTP 401 Unauthorized**, rendant la vérification terrain totalement inopérante.

---

## 4. AUDIT APPROFONDI : MOTEUR OFFLINE-FIRST, INDEXEDDB & SYNCHRONISATION

### 4.1 Modèle de Données Local (Dexie.js v4)
La conception de `CapefDexieDatabase.ts` est robuste :
- Le schéma en Version 4 implémente des tables dédiées pour `members`, `activities`, `lineItems`, `syncConflicts`, `media`, `operations`, `entityMappings`, et `profiles`.
- L'isolation multi-agent introduite en Phase 8A (`userId` systématiquement indexé sur toutes les tables locales) empêche qu'un agent A visualise ou synchronise les brouillons de l'agent B lors d'une session partagée sur une même tablette.

### 4.2 Cycle de Vie de la File d'Attente (`SyncEngine`)
Le flux d'exécution dans `sync-engine.ts` est un modèle du genre :
1. **Verrou Multi-Onglets :** Utilisation de l'API standard `navigator.locks.request('capef_sync_engine_lock')`, empêchant deux onglets ouverts en simultané de consommer la file et de provoquer des requêtes dupliquées.
2. **Coalescence Locale :** Annulation propre des paires `create` + `delete` créées et supprimées localement avant même l'accès au réseau.
3. **Backoff Exponentiel :** Échelonnage strict (1s, 2s, 4s, 8s, 16s, 30s) avec distinction entre erreurs réseau/5xx (réessayables) et erreurs 4xx de validation (marquées terminales `blocked` pour éviter le blocage de la file).
4. **Réconciliation Réseau Atome :** Lors du retour HTTP 201 avec le nouvel ID PostgreSQL (`serverId`), l'enregistrement est immédiatement consigné dans `entityMappings` et les opérations enfants en attente (`create_activity`, `create_line_item`) voient leurs références parentes résolues en cascade.

### 4.3 Anomalie Critique dans le Bootstrap Service (`OFF-001`)
Dans `artifacts/capef/src/lib/bootstrap-service.ts`, lignes 77 à 82 :
```typescript
if (user.role === 'agent') {
  params.set('createdById', userId);
} else if (user.role === 'superviseur' && user.regionId) {
  params.set('regionId', String(user.regionId));
}
```
**Diagnostic :**
Dans toute la base de code, les rôles sont normalisés en anglais : `'admin'`, `'supervisor'`, `'agent'`.
Le code compare `user.role === 'superviseur'` (en français avec faute de clé).
**Conséquence :** La condition est TOUJOURS fausse pour un superviseur. Le paramètre `regionId` n'est JAMAIS envoyé dans la requête de bootstrap. Le superviseur télécharge donc l'intégralité des membres du pays (ou subit un échec de pagination) au lieu d'être restreint à son ressort régional.

---

## 5. AUDIT SÉCURITÉ, AUTHENTIFICATION & CONTRÔLE D'ACCÈS (RBAC)

### 5.1 Sécurité des API et Middleware d'Authentification
- Le middleware `requireAppUser` (`artifacts/api-server/src/lib/auth.ts`) valide d'abord le jeton JWT Clerk via `@clerk/express`, puis effectue une recherche en base locale sur `usersTable`.
- Les comptes avec `status === 'suspended'` ou `'banned'` sont rejetés avec code HTTP 403 Forbidden dès le point d'entrée.

### 5.2 Scoping Horizontal et Vertical (Protection IDOR)
Dans `artifacts/api-server/src/routes/members.ts` :
- Les méthodes `getMemberWithAccessCheck`, `getActivityWithMemberCheck`, et `getLineItemWithActivityCheck` vérifient systématiquement la filiation parent-enfant dans la base de données.
- **Agent de terrain :** Ne peut requêter, modifier ou supprimer que les membres où `member.createdById === appUser.id`.
- **Superviseur régional :** Ne peut requêter ou modifier que les membres situés dans son `regionId`.
- **Admin :** Accès global, actions irréversibles (suppression définitive, validation officielle, blocage disciplinaire).

### 5.3 Sécurité des Médias et PII
- **Téléversement :** Le routeur `/api/uploads` filtre par liste blanche MIME (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`) et impose une limite de 5 Mo.
- **Révélation d'URLs Privées :** Aucune URL de stockage publique persistante n'est stockée en base de données. Seules les clés relatives (ex: `photo_MEMBER_CENTRE_17288921.jpg`) sont conservées dans PostgreSQL. L'accès aux fichiers s'effectue via des URLs pré-signées Supabase Storage à durée de vie restreinte (1 heure).

### 5.4 Point Critique : Sécurité des Données au Repos (`DATA-001`)
Le rapport Phase 14 (`PHASE_14_PRODUCTION_REPORT.md`) avait souligné cette frontière architecturale. Sur les smartphones Android d'entrée de gamme déployés sur le terrain :
- Les bases IndexedDB Chrome/Chromium résident dans `/data/data/com.android.chrome/app_chrome/Default/IndexedDB/` sous forme de fichiers LevelDB non chiffrés.
- Si une tablette est saisie, volée ou confiée à un tiers non habilité, les données nominatives, CNI et signatures des planteurs sont accessibles via débogage ADB ou lecture directe du stockage.
- **Remède recommandé :** Prévoir l'encapsulation Capacitor avec SQLCipher pour tout déploiement institutionnel formel (voir section 10).

---

## 6. AUDIT BACKEND, BASE DE DONNÉES & INTÉGRITÉ TRANSACTIONNELLE

### 6.1 Modèle Drizzle & Schéma PostgreSQL
Le schéma Drizzle (`lib/db/src/schema/members.ts`) fait preuve d'une excellente rigueur relationnelle :
- Présence d'une séquence PostgreSQL dédiée `seq_member_number` garantissant l'unicité stricte et incrémentale des matricules consulaires officiels (`CAPEF-AGR-000001`, `CAPEF-PCH-000002`).
- Contraintes uniques partielles `idxSinglePrimaryActivity` (`is_primary = true`) et `uniqueMemberActivityType` (`memberId, activityType`), empêchant qu'un membre possède plusieurs activités de même catégorie ou plus d'une activité principale.
- Clés étrangères avec `ON DELETE CASCADE` entre `members` -> `member_activities` -> `activity_line_items`.

### 6.2 Contrôle de Concurrence Optimiste (OCC)
- Les tables `members`, `member_activities`, et `activity_line_items` disposent de colonnes `version: integer("version").default(1).notNull()`.
- Lors d'une mise à jour (`PUT /api/members/:id`, `PUT /api/members/:id/activities/:activityId`, etc.), la requête compare la version transmise par le client avec la version courante en base.
- Si un autre agent ou un gestionnaire a modifié le dossier entre-temps, l'API renvoie immédiatement un code **HTTP 409 Conflict** avec l'état serveur actuel complet, déclenchant sur le frontend le modal interactif de résolution à 3 voies.

### 6.3 Présence d'un Endpoint Obsolète non Idempotent (`API-001`)
Aux lignes 2472-2525 de `artifacts/api-server/src/routes/members.ts` se trouve la route `POST /api/members/sync` :
```typescript
router.post("/members/sync", requireAppUser, async (req, res) => {
  // boucle itérative sur members
  // insertion avec memberNumber: "PENDING"
  // update avec generateMemberNumber(m.category, member.id)
})
```
**Analyse Critique :**
1. Cet endpoint n'utilise pas la séquence PostgreSQL `seq_member_number` mais injecte temporairement `"PENDING"`, puis utilise l'ID de la ligne comme numéro séquentiel.
2. Il ne prend pas en compte le suivi d'idempotence (`checkProcessedOperation`).
3. Il est absent de la documentation OpenAPI v4 et constitue un vecteur d'incohérence si invoqué par un client tiers non mis à jour.
**Verdict :** À déprécier et purger définitivement du backend.

---

## 7. AUDIT FRONTEND PWA, PERFORMANCE, RENDU & BUNDLE SIZE

### 7.1 Architecture PWA & Service Worker
Dans `artifacts/capef/vite.config.ts` :
- Workbox Service Worker configuré en mode `generateSW` avec `clientsClaim: true`, `skipWaiting: true` et `autoUpdate`.
- Règle de mise en cache d'API : `NetworkOnly` explicite sur tous les chemins `/api/.*`.
- **Exclusion Cruciale :** `globIgnores: ['**/stats.html']` empêche que le fichier d'analyse visuelle de 2.11 MB ne s'infiltre dans le cache pré-chargé du Service Worker.

### 7.2 Découpage du Code (Code Splitting & Dynamic Imports)
Le fichier `artifacts/capef/src/App.tsx` applique `React.lazy` et `React.Suspense` sur toutes les routes lourdes :
- `Dashboard`, `MembersList`, `MemberNew`, `MemberDetail`, `MemberEdit`, `ActivityWizard`.
- Les vendors volumineux sont isolés en chunks ciblés (`vendor-clerk`: 451 kB, `vendor-dexie`: 97 kB, `vendor-forms`: 91 kB, `vendor-i18n`: 65 kB).
- Tous les modules transformés respectent le seuil de 500 kB préconisé par Vite.

### 7.3 Ergonomie de Navigation : Lacune Menu Assigned Zones (`FE-001`)
Dans `artifacts/capef/src/components/layout/Shell.tsx` (lignes 35-40) :
```typescript
const navigation = [
  { name: t('navigation.dashboard'), href: '/dashboard', icon: LayoutDashboard },
  { name: t('navigation.members'), href: '/members', icon: Users },
  { name: t('navigation.new_enrollment'), href: '/members/new', icon: UserPlus },
  ...(isAdmin ? [{ name: t('navigation.users'), href: '/users', icon: ShieldAlert }] : []),
];
```
**Constat :**
La route `/profile/assigned-zones` (et son alias `/assigned-zones`) est parfaitement implémentée et dispose de son propre composant `AssignedZones.tsx` et de ses tests unitaires offline. Cependant, un agent de terrain n'y accède que via un lien textuel discret situé à l'intérieur de son profil (`Profile.tsx`). Pour les agents ayant des assignations précises (départements/arrondissements), l'absence de ce raccourci dans la barre latérale ou dans le bandeau de statut réduit la clarté opérationnelle.

---

## 8. CATALOGUE DÉTAILLÉ DES BUGS, ANTI-PATTERNS ET DETTES TECHNIQUES

### 8.1 Faille SEC-001 : Verrouillage Authentifié du Badge Public
- **Fichier :** `artifacts/api-server/src/routes/members.ts` (Ligne 2554)
- **Code Actuel :**
  ```typescript
  router.get("/members/badge/:badgeToken", requireAppUser, async (req, res): Promise<void> => { ... }
  ```
- **Problème :** Impossibilité pour un tiers ou un contrôleur sur le terrain sans compte CAPEF Clerk de vérifier la validité d'une carte d'adhérent par scan QR.
- **Correction Requise :**
  1. Remplacer `requireAppUser` par `publicRateLimiter`.
  2. Monter la route sur `/public/members/badge/:badgeToken` conformément à la spécification OpenAPI (`lib/api-spec/openapi.yaml`).
  3. Restreindre la projection des champs renvoyés (omettre `cniRectoUrl`, `cniVersoUrl`, coordonnées GPS privées, et données d'audit système).

### 8.2 Bug OFF-001 : Typos sur le Rôle Superviseur
- **Fichier :** `artifacts/capef/src/lib/bootstrap-service.ts` (Ligne 80)
- **Code Actuel :**
  ```typescript
  } else if (user.role === 'superviseur' && user.regionId) {
  ```
- **Problème :** Le rôle en base de données et dans Clerk est toujours `'supervisor'`. Le filtre est ignoré.
- **Correction Requise :**
  ```typescript
  } else if ((user.role === 'supervisor' || user.role === 'superviseur') && user.regionId) {
  ```

### 8.3 Dette PERF-001 : Esbuild Backend Monolithique
- **Fichier :** `artifacts/api-server/build.mjs`
- **Taille Constatée :** `dist/index.mjs` = 5.7 MB (avec sourcemap de 10.4 MB).
- **Cause :** L'inlining complet de packages lourds comme `exceljs`, `pino`, `@clerk/express` et `@supabase/supabase-js` dans un fichier JS unique.
- **Recommandation :** Configurer `external: ['@supabase/supabase-js', 'exceljs', 'pg']` dans `build.mjs` et laisser Node.js charger les dépendances natives depuis `node_modules` en production.

---

## 9. COUVERTURE DES TESTS & FIABILITÉ DES PROCESSUS CI/CD

### 9.1 Bilan Actuel des Suites de Tests
L'application dispose d'une suite de tests automatisés exceptionnellement riche :
- **Frontend Vitest :** 19 fichiers de test, **65 tests passés avec succès (100%)** en 2.87 secondes.
  - Couverture : Simulation continue offline de 72h (`72h-offline.test.ts`), tolérance aux pannes réseau, réconciliation d'identifiants, cycle de vie Service Worker, détection de cache corrompu.
- **Backend Vitest :** 8 fichiers de test, **46 tests passés avec succès (100%)** en 8.97 secondes.
  - Couverture : Concurrence atomique sur 10 requêtes simultanées, intégrité relationnelle, conflits OCC (409), isolation RBAC, replay d'idempotence (`200 OK` vs `422 Unprocessable Entity`).

### 9.2 Lacunes de Tests Identifiées :
1. **Test E2E Live de Flapping Réseau :** Aucun test ne simule une perte de connexion en cours de streaming HTTP sur `/members/export` ou pendant le téléversement d'un Blob de 4 Mo.
2. **Test de Quota Exceeded :** Les tests simulent le stockage Dexie mais ne testent pas le comportement applicatif lorsque `navigator.storage.estimate()` atteint 99% d'utilisation sur appareil avec espace saturé.

---

## 10. PLAN DE REMÉDIATION STRATÉGIQUE ET RECOMMANDATIONS

Pour amener le système à un niveau de maturité industrielle parfait (Grade A+ Entreprise), voici la feuille de route priorisée :

### Jalon 1 (Immédiat — P1/P0 Bugs)
1. **Corriger `bootstrap-service.ts` (Ligne 80) :** Aligner le rôle `'supervisor'` pour garantir le scoping régional des superviseurs au démarrage offline.
2. **Sécuriser et Exposer la Vérification Publique de Badge :**
   - Créer la route publique non authentifiée `GET /api/public/members/badge/:badgeToken` protégée par `publicRateLimiter`.
   - Filtrer rigoureusement la réponse pour ne renvoyer que les données visibles sur la carte (Nom, Matricule, Catégorie, Région, Statut d'enrôlement, Photo faciale).
3. **Supprimer l'Endpoint Legacy `/api/members/sync` :**
   - Éliminer le code obsolète qui contourne la séquence de numérotation consulaire.

### Jalon 2 (Court Terme — Confort & Ergonomie)
1. **Optimiser le Build Backend (`build.mjs`) :**
   - Externaliser les dépendances serveur lourdes pour réduire le bundle de 5.7 MB à moins de 800 kB.
2. **Ajouter un Raccourci Direct pour les Zones Assignées :**
   - Ajouter un indicateur de zone dans le header de l'application ou dans la barre latérale pour les agents et superviseurs.

### Jalon 3 (Moyen Terme — Confidentialité Renforcée)
1. **Migration vers Conteneur Hybride (Capacitor + SQLCipher) :**
   - Dans le cadre d'un déploiement à grande échelle (10 000 agents), remplacer IndexedDB par une base SQLite chiffrée par une clé stockée dans le Keystore matériel Android.

---

*Fin du Rapport d'Audit Technique et Architectural.*
