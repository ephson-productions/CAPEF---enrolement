# AUDIT ARCHITECTURE OFFLINE & PLAN DE REMÉDIATION — CAPEF DIGITAL ENRÔLEMENT

**Projet :** CAPEF DIGITAL ENRÔLEMENT
**Document :** Rapport d'Audit Architecture Offline & Plan de Remédiation (Phase 0 & Phase 0.5)
**Date :** 15 Septembre 2026
**Auteur :** Principal Lead Full-Stack Software Engineer

---

## 1. Architecture Offline Actuelle

L'architecture offline de l'application PWA CAPEF repose sur une file d'attente minimale basée sur `localStorage` et un mécanisme de synchronisation manuelle/automatique lors du retour en ligne.

### Diagramme ASCII de l'Architecture Offline Actuelle

```
+---------------------------------------------------------------------------------------------------+
|                                     FRONTEND PWA (Vite + React)                                   |
|                                                                                                   |
|  [ Interface Utilisateur / Pages ]                                                                |
|   |         |                                                                                     |
|   | (Read)  | (Write Mutation)                                                                    |
|   v         v                                                                                     |
|  [TanStack QueryClient]                     [OfflineQueueProvider]                                |
|  - Config par défaut (staleTime: 0)          - Écoute les événements window online/offline         |
|  - En mémoire uniquement (PAS de cache IDB)  - Expose enqueueMember & enqueueActivityAction        |
|  - Réinitialisé à chaque changement d'agent |                                                     |
|                                             v                                                     |
|                                  [LocalStorageQueueRepository]                                    |
|                                  - Clé: 'capef_offline_queue_v2'                                  |
|                                  - Queue items: {id, clientOperationId, status, payload, ...}     |
|                                                                                                   |
|                                             |                                                     |
|                                             | syncNow() (quand online)                            |
|                                             v                                                     |
|                                    [customFetch / API Client]                                     |
|                                    - En-tête: X-Client-Operation-ID                               |
+---------------------------------------------------------------------------------------------------+
                                              |
                                              | HTTP POST/DELETE
                                              v
+---------------------------------------------------------------------------------------------------+
|                                      SERVEUR API (Express)                                        |
|                                                                                                   |
|  [ Routes Express ]                                                                               |
|  - POST /api/members                                                                              |
|  - POST /api/members/:id/activities                                                               |
|  - POST /api/members/:id/activities/:activityId/line-items                                       |
|  - DELETE /api/members/:id/activities/:activityId/line-items/:itemId                             |
|                                                                                                   |
|  [ Base de Données / Drizzle ORM ]                                                                |
|  - Clé d'idempotence via processed_operations (clientOperationId UUID PK)                         |
+---------------------------------------------------------------------------------------------------+
```

### Composants Clés
1. **PWA Configuration (`vite.config.ts`)**: Plugin `VitePWA` configuré en `registerType: 'autoUpdate'` incluant `logo.png` et `favicon.png`. Aucune stratégie de mise en cache HTTP avancée (`runtimeCaching` pour les routes API ou données dynamiques) n'est définie dans Workbox.
2. **Queue Repository (`artifacts/capef/src/lib/offline-repository.ts`)**: `LocalStorageQueueRepository` implémente `IOfflineQueueRepository` sous la clé `capef_offline_queue_v2`. Il prend en charge la migration automatique des anciennes clés (`capef_offline_queue` et `capef_offline_actions_queue`).
3. **Queue Provider & Sync Processor (`artifacts/capef/src/lib/offline-sync.tsx`)**: Fournit le contexte React `OfflineQueueContext`. Il réagit aux événements `online`/`offline`. La méthode `syncNow()` dépile les éléments en état `pending` ou `processing`, attache l'en-tête `X-Client-Operation-ID`, et envoie les requêtes HTTP. En cas de réponse HTTP 200/201, l'élément est supprimé du stockage. En cas d'erreur HTTP 4xx (erreur terminale de validation/métier), le statut passe à `failed`. En cas d'erreur réseau ou 5xx, l'élément est conservé avec incrémentation de `retryCount` et le cycle est différé.
4. **TanStack QueryClient (`artifacts/capef/src/App.tsx`)**: Instanciation standard `const queryClient = new QueryClient();` sans persistance de cache (aucun `PersistQueryClient` / `createSyncStoragePersister`).

---

## 2. Offline Capability Matrix

Inventaire strict des capacités hors ligne actuelles par écran/fonction de l'application :

| Écran / Fonction | Lecture Offline | Création Offline | Modification Offline | Suppression Offline | Médias Offline | Note & Comportement Réel |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | NON | NON | NON | NON | NON | Requis requêtes API live (`/api/dashboard/stats` et `/api/dashboard/recent`). Perte totale si rafraîchi sans réseau. |
| **Members List** | NON | NON | NON | NON | NON | Appelle `/api/members` via TanStack Query. Aucune donnée conservée offline. |
| **Member Detail** | NON | NON | NON | NON | NON | Appelle `/api/members/:id` et `/api/members/:id/activities`. Visualisation/téléchargement du badge nécessite du réseau. |
| **Member New** | PARTIELLE | OUI | NON | NON | PARTIELLE | Formulaire accessible. Listes déroulantes géographiques (Région, Dépt, Arrondissement) nécessitent les requêtes de référence (échouent si non pré-chargées en mémoire). Soumission capturée via `enqueueMember` en `create_member`. Photos compressées en Base64. |
| **Member Edit** | NON | NON | NON | NON | NON | Pré-remplissage via API live. La soumission utilise `useUpdateMember` directement sans passer par la queue offline. |
| **Activities / Line Items** | NON | OUI | NON | OUI | NON | Consultation requiert le réseau. Ajout d'activité (`create_activity`), de ligne de production (`create_line_item`), et suppression de ligne (`delete_line_item`) supportés via `enqueueActivityAction`. |
| **Users / Agents** | NON | NON | NON | NON | NON | Gestion des agents (`/api/users`) 100% en ligne. |
| **Profile Agent** | PARTIELLE | NON | NON | NON | NON | Profil affiché depuis le contexte d'authentification en mémoire. Mise à jour (`PATCH /api/auth/profile`) nécessite le réseau. |

---

## 3. API Contract Inventory

Analyse exhaustive des 35 routes de `artifacts/api-server/src/routes/` à partir du code réel :

| Endpoint | Method | Auth requis | Request Schema | Response Schema | Offline capable aujourd'hui ? | Idempotence (`clientOperationId`) ? | Gestion de conflit ? | Cache local existant ? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/healthz` | GET | Non | Aucun | `HealthCheckResponse` | Non | Non | N/A | Aucun |
| `/api/auth/me` | GET | RequireAppUser | Aucun | `AppUser` | Non | Non | N/A | Aucun |
| `/api/auth/provision` | POST | RequireAuth | `{ name?, email?, data? }` | `AppUser` | Non | Non | Check email/clerkUserId | Aucun |
| `/api/auth/profile` | PATCH | RequireAppUser | `{ cniNumber?, cniPhotoUrl?, profilePhotoUrl? }` | `AppUser` | Non | Non | N/A | Aucun |
| `/api/regions` | GET | Non | Query `{}` | `Region[]` | Non | Non | N/A | En mémoire QueryClient |
| `/api/departments` | GET | Non | Query `{ regionId? }` | `Department[]` | Non | Non | N/A | En mémoire QueryClient |
| `/api/arrondissements` | GET | Non | Query `{ departmentId? }` | `Arrondissement[]` | Non | Non | N/A | En mémoire QueryClient |
| `/api/users` | GET | RequireAppUser (admin/superv) | Query `{ role?, regionId?, status? }` | `AppUser[]` | Non | Non | N/A | Aucun |
| `/api/users` | POST | RequireAppUser (admin) | `CreateUserBody` | `AppUser` (201) | Non | Non | Email unique (HTTP 400) | Aucun |
| `/api/users/:id` | GET | RequireAppUser (admin) | Path `:id` | `AppUser` | Non | Non | N/A | Aucun |
| `/api/users/:id` | PUT | RequireAppUser (admin) | Path `:id`, Body updates | `AppUser` | Non | Non | N/A | Aucun |
| `/api/users/:id` | DELETE | RequireAppUser (admin) | Path `:id` | 204 No Content | Non | Non | Suppression Clerk + DB | Aucun |
| `/api/members` | GET | RequireAppUser | Query params | `MemberListResponse` | Non | Non | N/A | Aucun |
| `/api/members` | POST | RequireAppUser | `CreateMemberBody` + `clientOperationId?` | `Member` (201) | **OUI** | **OUI** (`processed_operations`) | Transaction atomic DB | LocalStorage Queue |
| `/api/members/export` | GET | RequireAppUser | Query params | Excel Stream (`.xlsx`) | Non | Non | N/A | Aucun |
| `/api/members/:id` | GET | RequireAppUser | Path `:id` | `Member` | Non | Non | N/A | Aucun |
| `/api/members/:id` | PUT | RequireAppUser | Path `:id`, Body updates | `Member` | Non | Non | N/A | Aucun |
| `/api/members/:id` | DELETE | RequireAppUser | Path `:id` | 204 No Content | Non | Non | Contrainte FK | Aucun |
| `/api/members/:id/activities` | GET | RequireAppUser | Path `:id` | `MemberActivity[]` | Non | Non | N/A | Aucun |
| `/api/members/:id/activities` | POST | RequireAppUser | Path `:id`, Body + `clientOperationId?` | `MemberActivity` (201) | **OUI** | **OUI** (`processed_operations`) | Unique `member_id` + `activity_type` | LocalStorage Queue |
| `/api/members/:id/activities/:activityId` | PUT | RequireAppUser | Path `:id`, `:activityId`, Body | `MemberActivity` | Non | Non | N/A | Aucun |
| `/api/members/:id/activities/:activityId` | DELETE | RequireAppUser | Path `:id`, `:activityId` | 204 No Content | Non | Non | N/A | Aucun |
| `/api/members/:id/activities/:activityId/line-items` | POST | RequireAppUser | Path `:id`, `:activityId`, Body + `clientOperationId?` | `ActivityLineItem` (201) | **OUI** | **OUI** (`processed_operations`) | Transaction atomic DB | LocalStorage Queue |
| `/api/members/:id/activities/:activityId/line-items/:itemId` | PUT | RequireAppUser | Path `:id`, `:activityId`, `:itemId`, Body | `ActivityLineItem` | Non | Non | N/A | Aucun |
| `/api/members/:id/activities/:activityId/line-items/:itemId` | DELETE | RequireAppUser | Path `:id`, `:activityId`, `:itemId` | 204 No Content | **OUI** | Non | N/A | LocalStorage Queue |
| `/api/members/:id/validate` | POST | RequireAppUser | Path `:id` | `Member` | Non | Non | Transition statut | Aucun |
| `/api/members/:id/deactivate` | POST | RequireAppUser | Path `:id` | `Member` | Non | Non | Transition statut | Aucun |
| `/api/members/:id/reactivate` | POST | RequireAppUser | Path `:id` | `Member` | Non | Non | Transition statut | Aucun |
| `/api/members/:id/block` | POST | RequireAppUser | Path `:id` | `Member` | Non | Non | Transition statut | Aucun |
| `/api/members/:id/badge` | POST | RequireAppUser | Path `:id` | SVG String | Non | Non | N/A | Aucun |
| `/api/members/sync` | POST | RequireAppUser | `{ lastSyncAt? }` | `{ members, activities, lineItems }` | Non | Non | Delta sync timestamp | Aucun |
| `/api/members/badge/:badgeToken` | GET | RequireAppUser | Path `:badgeToken` | `Member` | Non | Non | N/A | Aucun |
| `/api/dashboard/stats` | GET | RequireAppUser | Query params | `DashboardStats` | Non | Non | N/A | Aucun |
| `/api/dashboard/recent` | GET | RequireAppUser | Query params | `MemberSummary[]` | Non | Non | N/A | Aucun |
| `/api/uploads` | POST | RequireAppUser | `{ base64Data, mimeType, fileName }` | `{ url, fileName }` | Non | Non | N/A | Aucun |

---

## 4. Local Data Scope

Périmètre exact des données nécessaires en local pour un agent sur le terrain après bootstrap :

1. **Référentiel Géographique Complet (Recompté depuis `artifacts/api-server/src/lib/seed.ts`)** :
   - **10** Régions : Adamaoua, Centre, Est, Extrême-Nord, Littoral, Nord, Nord-Ouest, Ouest, Sud, Sud-Ouest.
   - **27** Départements.
   - **106** Arrondissements.
2. **Périmètre Membres & Enrôlements** :
   - Pour un **Agent** : Ensemble des membres créés par lui-même (`created_by_id = appUser.id`).
   - Pour un **Superviseur** : Ensemble des membres enregistrés dans sa région d'affectation (`region_id = appUser.regionId`).
   - Pour un **Admin** : Ensemble des membres de sa zone d'affectation.
3. **Activités et Line Items Associés** :
   - L'exhaustivité des `member_activities` et `activity_line_items` rattachés aux membres du périmètre de l'agent.

---

## 5. Modèle d'Identité des Entités

Analyse des identifiants dans le schéma de base de données (`lib/db/src/schema/`) et dans le frontend :

- `userId` : Clef primaire entière auto-incrémentée (`serial`) dans `usersTable`, liée à `clerkUserId` (`text` unique).
- `serverEntityId` : Clefs primaires entières auto-incrémentées (`id: serial`) dans `membersTable`, `memberActivitiesTable`, et `activityLineItemsTable`.
- `localEntityId` : **N'EXISTE PAS** actuellement. Lors d'une création offline, l'élément en file d'attente dispose d'un UUID `id` de queue. Il n'existe pas d'ID local temporaire (ex. `temp_member_123`) permettant de lier une activité créée hors ligne à un membre créé dans la même session hors ligne avant synchronisation serveur.
- `clientOperationId` : Colonne UUID (`client_operation_id`) dans `processedOperationsTable`. Transmise par le client dans l'en-tête HTTP `X-Client-Operation-ID` ou le corps JSON, garantissant l'idempotence des re-soumissions sur le serveur.

---

## 6. Modèle de Conflit par Type d'Entité

État réel constaté dans le code :

- **Membres** : **Aucun modèle de résolution de conflit métier**. Le serveur génère le numéro de membre séquentiel (`seq_member_number`). En cas de soumission identique avec le même `clientOperationId`, le serveur renvoie le résultat déjà enregistré dans `processedOperationsTable`. En cas de double saisie d'un même individu par deux agents différents, deux entrées distinctes sont créées sans alerte de doublon.
- **Activités** : Index unique PostgreSQL `unique_member_activity_type` sur `(member_id, activity_type)`. Si une seconde activité du même type est soumise pour un même membre, le serveur rejette la requête avec une erreur HTTP 400.
- **Line Items** : Aucun modèle de conflit. Les lignes sont insérées séquentiellement.
- **Médias** : Les fichiers uploadés reçoivent un nom unique basé sur `Date.now()_randomString`. Aucun conflit de nommage n'est possible, mais pas de gestion offline des uploads différés.

---

## 7. Cycle de Vie Complet des Médias

Analyse du flux de gestion des photos et documents :

1. **Capture / Sélection** : Via le composant `ImageUploadField` (`MemberForm.tsx`).
2. **Compression Frontend** : Exécutée immédiatement sur le client via un `HTML5 Canvas`. L'image est redimensionnée pour respecter un encadrement maximal de 1024x1024 pixels, puis convertie en chaîne Data URL `image/jpeg` avec un ratio de compression de `0.7` (`canvas.toDataURL('image/jpeg', 0.7)`).
3. **Stockage Temporaire Client** : La chaîne Base64 est stockée directement dans le state du formulaire (`physiqueData.cniPhotoUrl` ou `moraleData.statutsUrl`).
4. **Queue Hors Ligne** : Si l'appareil est hors ligne, la chaîne Base64 compressée est directement intégrée dans le payload JSON de l'opération enfilettée dans `localStorage` (`capef_offline_queue_v2`).
5. **Upload & Confirmation** : Lors de la synchronisation, le payload JSON contenant la chaîne Base64 est envoyé au serveur (`POST /api/members`). Si la connexion est disponible lors de la saisie, l'upload direct via `POST /api/uploads` envoie la Base64 à Supabase Storage (`member-documents`) et retourne une URL HTTPS publique.

---

## 8. Versioning de Schéma IndexedDB / PWA / API

État actuel constaté :

- **IndexedDB** : **INEXISTANT**. Seul `localStorage` est utilisé.
- **Migration de Queue LocalStorage** : Présence d'un mécanisme minimal dans `LocalStorageQueueRepository` migratant les clés obsolètes (`capef_offline_queue` et `capef_offline_actions_queue`) vers `capef_offline_queue_v2`. Aucun versioning de schéma métier.
- **PWA / Service Worker** : Configuré via `vite-plugin-pwa` avec `registerType: 'autoUpdate'`. Aucun Service Worker custom n'intercepte ni ne met en cache les requêtes d'API.
- **Compatibilité API** : Aucun en-tête de versioning (`X-API-Version`) ni contrôle de compatibilité entre le schéma PWA client et l'API Express.

---

## 9. Modèle de Menace pour l'Authentification Offline

Documenté selon le comportement réel du code :

- **Comportement Client (@clerk/react)** : Le SDK Clerk gère les tokens JWT en mémoire et les rafraîchit périodiquement via les serveurs Clerk. En mode hors ligne prolongé, dès que le jeton JWT expire, le SDK ne peut plus en émettre de nouveau.
- **Comportement Serveur (@clerk/express & `requireAppUser`)** : Sur le serveur API (`artifacts/api-server/src/lib/auth.ts`), le middleware `requireAppUser` authentifie le jeton Bearer JWT puis valide la présence de l'utilisateur dans la base PostgreSQL (`usersTable`).
- **Risque / Menace Hors Ligne** : Si l'agent travaille hors ligne au-delà de la durée de validité de son jeton JWT, les requêtes de synchronisation envoyées au retour en ligne échoueront avec un code HTTP 401 si le token n'a pas pu être rafraîchi par Clerk. Aucune persistance sécurisée offline des identifiants/rôles n'existe localement.

---

## 10. Stratégie de Rollback

Procédure de secours en cas d'anomalie bloquante en production :

1. **Isolation & Commits Atomiques** : Chaque phase de remédiation est isolée dans un commit atomique unique.
2. **Rollback Applicatif (Code)** :
   - Exécution de `git revert <commit-hash>`.
   - Re-génération des contrats via `pnpm --filter @workspace/api-spec run codegen`.
   - Re-build complet (`pnpm run build`) pour valider la stabilité du bundle.
3. **Rollback Base de Données (Schéma)** :
   - Les migrations DDL sont strictly versionnées dans `lib/db/drizzle/`.
   - Le script de prévol `lib/db/src/preflight-check.ts` contrôle l'état de la base avant toute modification.
   - En cas d'échec de migration, `standalone-migrate.ts` interrompt l'exécution avec un code de sortie `process.exit(1)`, empêchant le lancement du serveur sur un schéma corrompu.
   - Restauration de la base via sauvegarde Point-In-Time Recovery (PITR) Supabase en cas d'anomalie de données critique.

---

## 11. Politique de Déconnexion (Logout) — Décision d'Ephraim & Spécifications

### Risque Sécurité / Intégrité Confirmé dans le Code
Dans `artifacts/capef/src/App.tsx`, le composant `ClerkQueryClientCacheInvalidator` s'abonne aux changements d'utilisateur Clerk :
```ts
const unsubscribe = addListener(({ user }) => {
  const userId = user?.id ?? null;
  if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
    queryClient.clear();
  }
  prevUserIdRef.current = userId;
});
```
**Constat :** Lors d'un changement d'utilisateur sur un appareil partagé, seul le cache React Query en mémoire (`queryClient.clear()`) est vidé. La file d'attente hors ligne stockée dans `localStorage` sous la clé `capef_offline_queue_v2` **n'est jamais nettoyée ou namespacée par utilisateur**.

### Décision Formelle d'Ephraim (Combinaison Hybride Option A + Option C)

1. **Namespacing Multi-Agent Obligatoire (Principe de l'Option C) :**
   - La file d'attente locale et le cache IndexedDB seront **strictement namespacés par `clerkUserId`** (ex. `capef_offline_queue_${clerkUserId}`).
   - Ainsi, aucun Agent B se connectant sur la tablette d'un Agent A ne verra ou ne synchronisera la file de l'Agent A.

2. **Politique de Blocus avec Alerte & Dérogation (Hybride Option A + Alerte de secours) :**
   - **Comportement Standard :** Si l'agent tente de se déconnecter alors que des opérations sont en attente (`pendingOperations > 0`), le bouton de déconnexion active un blocus préventif (Option A) l'invitant à retrouver du réseau et à synchroniser.
   - **Procédure d'Alerte / Confirmation de Secours :** Si l'agent insiste et tente de forcer le logout après ce blocus, une modale d'alerte critique s'affiche déclarant explicitement que des données sont en attente. Si l'agent confirme l'action de forçage, les données restent conservées de manière sécurisée dans son store namespacé (`capef_offline_queue_${clerkUserId}`), prêtes à être resynchronisées lorsqu'il se reconnectera sur son compte.

---

## 12. Modèle d'Authentification Offline — Validation & Fonctionnement Opérationnel

### Décision Formelle d'Ephraim
Le modèle d'authentification offline est **formellement confirmé**.

### Déroulement Opérationnel Pratique ("Comment ça va se passer")

```
+--------------------------------------------------------------------------------------------------+
|                                  PHASE 1 : MODE CONNECTÉ (ONLINE)                                |
|  1. L'agent s'authentifie via Clerk (Saisie identifiants).                                      |
|  2. Le SDK Clerk émet un jeton JWT en mémoire et un refresh token.                                |
|  3. L'application récupère le profil de l'agent (/api/auth/me) et met en cache localement         |
|     (dans IndexedDB sécurisé) : { clerkUserId, name, role, regionId, assignedZones }.             |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
|                                PHASE 2 : PASSAGE HORS LIGNE (OFFLINE)                            |
|  1. L'agent perd la connexion réseau (zone blanche).                                              |
|  2. L'UI React utilise le profil mis en cache localement pour le GATING LOCAL :                   |
|     - Rôle 'agent' : accès au formulaire d'enrôlement, masquage des fonctions admin.             |
|     - Filtre automatique des formulaires par sa région/zone d'affectation mise en cache.          |
|  3. Saisie des enrôlements : l'agent remplit les formulaires.                                    |
|  4. Les enrôlements sont enregistrés localement dans IndexedDB dans la queue namespacée.          |
|     AUCUN APPEL SERVEUR N'EST EFFECTUÉ À CE STADE.                                               |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
|                             PHASE 3 : RETOUR EN LIGNE (RESYNCHRONISATION)                         |
|  1. L'appareil retrouve la connexion réseau.                                                     |
|  2. Le SDK @clerk/react rafraîchit automatiquement le jeton JWT auprès des serveurs Clerk.       |
|  3. Le moteur de synchronisation (syncNow) dépile les éléments localement stockés et envoie    |
|     les requêtes HTTP POST avec l'en-tête Bearer JWT.                                            |
|  4. Le serveur Express intercepte la requête via le middleware `requireAppUser` :                |
|     - Validation dynamique de la signature du JWT via `getAuth(req)`.                            |
|     - Vérification en temps réel dans PostgreSQL (usersTable) que l'agent est toujours 'active'    |
|       (non suspendu / non banni).                                                                |
|  5. Si l'agent est valide : la transaction d'enrôlement est commitée en BDD.                     |
|  6. Si le jeton est expiré/invalide (ex: session de plus de 30 jours sans réseau) :                |
|     - Le serveur retourne HTTP 401 Unauthorized.                                                  |
|     - La synchronisation s'interrompt SANS SUPPRIMER les données locales.                        |
|     - Une invitation à se ré-authentifier s'affiche. Dès que l'agent se re-connecte, la queue     |
|       reprend la synchronisation en toute sécurité.                                               |
+--------------------------------------------------------------------------------------------------+
```

---

## 13. Offline Capability Contract (Périmètre Cible après les 17 Phases)

Reprise et formalisation de la matrice des capacités cibles visées à l'issue du plan de remédiation :

| Écran / Fonction | Lecture Cible | Création Cible | Modification Cible | Suppression Cible | Médias Cible | Justification Architectural du Périmètre Cible |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | OUI (Cache) | N/A | N/A | N/A | N/A | Lecture hors ligne via données agrégées persistées en IndexedDB. |
| **Members List** | OUI | N/A | N/A | N/A | N/A | Consultation hors ligne limitée au périmètre de l'agent (`createdById`) ou de sa région. |
| **Member Detail** | OUI | N/A | N/A | N/A | OUI (Cache) | Affichage complet depuis IndexedDB. Visualisation du badge SVG pré-généré ou généré localement. |
| **Member New** | OUI | OUI | N/A | N/A | OUI | Saisie 100% hors ligne avec référentiels géographiques pré-chargés. Photos compressées et stockées en Blob IndexedDB. |
| **Member Edit** | OUI | N/A | OUI | N/A | OUI | Modification hors ligne supportée avec file d'attente d'update (`update_member`). |
| **Activities / Line Items** | OUI | OUI | OUI | OUI | OUI | Gestion complète hors ligne des activités, parcelles, et spéculations avec identifiants locaux temporaires (`clientOperationId`). |
| **Users / Agents** | NON | NON | NON | NON | NON | **Reste 100% Online.** La création et gestion des agents requiert les API Clerk et la sécurité Admin en direct. |
| **Profile Agent** | OUI | N/A | OUI | N/A | OUI | Profil et zone d'affectation consultables hors ligne. Mises à jour de profil mises en file d'attente. |

---

## 14. Rappel Source de Vérité

> **NOTE RÈGLE NON NÉGOCIABLE :**
> Aucun chiffre cité dans ce document audit, dans la documentation de cadrage, ou dans les 17 phases d'implémentation suivantes ne doit être considéré comme source de vérité absolue tant qu'il n'a pas été recompté et vérifié directement depuis `artifacts/api-server/src/lib/seed.ts` ou la base de données réelle après exécution des migrations.
