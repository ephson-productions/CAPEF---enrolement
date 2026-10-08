# CAPEF — Architecture Offline-First, Moteur de Synchronisation & Guide d'Exploitation

---

## 1. Architecture Local-First

L'application CAPEF PWA suit une architecture **Local-First** stricte où l'interface utilisateur interagit exclusivement avec le modèle de domaine local avant tout échange réseau.

```text
       ┌─────────────────────────────────────────────────────────┐
       │                     UI (React Views)                    │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │     Repository Layer (MemberRepository, MediaRepo)      │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │       Modèle Local & Persistence (IndexedDB / Dexie)    │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │            File d'Opérations (db.operations)            │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │     Sync Engine (Web Locks API, Deduplication, Replay)  │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │                API Express (REST Endpoints)             │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │               Base de Données PostgreSQL                │
       └─────────────────────────────────────────────────────────┘
```

### Rôle des Couches
1. **UI Components :** Consultent et saisissent les données via le Repository Layer. Ne manipulent jamais directement l'API backend pour la logique de consultation/saisie offline.
2. **Repository Layer (`MemberRepository.ts`) :** Fournit les données locales en Stale-While-Revalidate. Gère la déduplication et l'isolation des drafts par utilisateur.
3. **Local Domain Model (`CapefDexieDatabase.ts`) :** Base IndexedDB v4 typée contenant les tables `members`, `activities`, `lineItems`, `media`, `syncConflicts`, `operations`, `entityMappings`, `profiles`, et tables de référence géographique (`regions`, `departments`, `arrondissements`).
4. **Operation Queue (`db.operations`) :** Stocke les mutations offline de manière durable avec UUID client immutable `clientOperationId`.
5. **Sync Engine (`syncEngine.ts`) :** Exécute la synchronisation en tâche de fond avec verrouillage Web Locks API, téléversement préalable des médias Blobs, résolution des dépendances parent/enfant, et rejeu d'idempotence.
6. **API Express (`/api/members`) :** Contrôle les autorisations RBAC par rôle/région, vérifie les versions OCC (409) et garantit l'idempotence via la table `processed_operations`.

---

## 2. Modèle de Données Local (Dexie v4 Schema)

| Table | Clé Primaire | Index & Champs Clés | Description |
| :--- | :--- | :--- | :--- |
| `members` | `++id` (auto) | `&localId`, `serverId`, `userId`, `memberNumber`, `category`, `status`, `syncStatus` | Registre des acteurs agropastoraux locaux |
| `activities` | `++id` (auto) | `&localId`, `serverId`, `memberLocalId`, `userId`, `activityType`, `isPrimary`, `syncStatus` | Questionnaire d'activités (5 secteurs) |
| `lineItems` | `++id` (auto) | `&localId`, `serverId`, `activityLocalId`, `userId`, `syncStatus` | Lignes de production (cultures, cheptel, espèces, etc.) |
| `syncConflicts` | `++id` (auto) | `conflictId`, `userId`, `entityType`, `localId`, `status` | Historique et état des conflits de version OCC (409) |
| `media` | `++id` (auto) | `mediaId`, `userId`, `syncStatus` | Fichiers images compressés sous forme de Blobs binaires |
| `operations` | `++id` (auto) | `operationId`, `clientOperationId`, `userId`, `status` | File d'attente des mutations offline |
| `entityMappings` | `++id` (auto) | `[entityType+localId]`, `localId`, `serverId` | Table de réconciliation des identifiants local $\leftrightarrow$ serveur |
| `profiles` | `clerkUserId` | `email`, `role` | Profils locaux autorisés et hash PIN WebCrypto |

---

## 3. Cycle de Vie d'une Opération Offline

```text
 Enregistrement Saisie
          │
          ▼
   Génération UUID clientOperationId
          │
          ▼
   Insertion durable dans db.operations (status: 'pending')
          │
          ▼
   Connexion Réseau Détectée (Healthz Check OK)
          │
          ▼
   Verrou Web Locks API ('capef_sync_engine_lock')
          │
          ▼
   1. Téléversement Préalable des Blobs Médias (/api/media/upload)
   2. Nettoyage & Coalescence (Ex: Create + Delete annulation)
   3. Exécution Rejeu avec En-tête X-Client-Operation-ID
          │
     ┌────┴──────────────────────────┐
     ▼                               ▼
 Succès 200/201              Erreur / Conflit
     │                               │
     ▼                               ▼
Réconciliation Dexie         ┌───────┴──────────────────┐
- Backfill serverId          ▼                          ▼
- syncStatus = 'synced'    HTTP 409 OCC            HTTP 5xx / Network
- entityMappings           - Log syncConflicts     - Increment retryCount
- Suppression queue        - status = 'blocked'    - retryCount >= 5 -> 'blocked'
- Signal aux 'waiting'     - Choix utilisateur UI  - Manuel "Relancer" dans Modal
```

---

## 4. Politique de Session Offline & Sécurité

1. **Durée de Conservation Offline :**
   - 21 jours d'autonomie maximale (`MAX_OFFLINE_DURATION_MS = 21 * 24 * 60 * 60 * 1000`).
   - À l'expiration des 21 jours sans vérification réseau, l'application bascule en mode **lecture seule expirée** (`expired-readonly`).
2. **Authentification Offline par PIN :**
   - Hachage sécurisé du PIN local via WebCrypto API (`crypto.subtle.pbkdf2`) avec 100 000 itérations, SHA-256 et sel aléatoire de 16 octets.
   - Aucun token Clerk, mot de passe ou secret utilisateur n'est stocké dans IndexedDB ou LocalStorage.
3. **Isolation Multi-Comptes :**
   - Les clés de stockage et enregistrements Dexie sont scopés par `userId` (`clerkUserId`).
   - Lors d'un changement de session sur un appareil partagé, les drafts non synchronisés de l'Agent A restent isolés et inaccessibles pour l'Agent B.

---

## 5. Guide d'Exploitation des Conflits de Version OCC (409)

Lorsque deux utilisateurs ou appareils modifient le même membre simultanément hors ligne, le serveur rejette la mutation obsolète avec un code HTTP 409 Conflict. L'opération est conservée dans la file avec le statut `blocked`, enregistrée dans `db.syncConflicts`, et présentée dans le dashboard d'observability.

### Choix de Résolution Utilisateur
Dans le modal **Observabilité & Synchronisation Terrain**, l'agent dispose de 3 options explicites :

1. **Conserver la mienne (Overriding Server) :**
   - Met à jour la version de l'opération locale avec la version serveur actuelle (`serverVersion`).
   - Repasse le statut de l'opération à `pending` et relance la synchronisation.
   - Écrase le serveur avec la saisie locale courante.

2. **Prendre la version serveur (Accept Server) :**
   - Annule et retire l'opération locale de la file d'attente.
   - Télécharge et met à jour le membre local dans Dexie avec la version serveur reçue dans la réponse 409.
   - Marque le conflit comme résolu.

3. **Modifier puis rejouer (Edit & Retry) :**
   - Retire l'opération bloquée et redirige l'agent vers la vue de modification (`/members/:id/edit`).
   - Permet à l'agent de fusionner visuellement les informations avant de valider à nouveau.

---

## 6. Limites Plateforme Connues & Précautions

| Limite Plateforme | Impact | Précautions & Mitigation |
| :--- | :--- | :--- |
| **Effacement des données navigateur / Mode Privé** | La suppression manuelle des données de navigation ou l'utilisation du mode navigation privée efface IndexedDB. | Avertir les agents de ne jamais vider le cache du navigateur sur le terrain tant que le compteur d'attente n'est pas à 0. |
| **Eviction Safari iOS (7 jours)** | iOS Safari peut supprimer les bases IndexedDB inutilisées après 7 jours d'inactivité. | Les agents sur iPhone/iPad doivent ouvrir l'application au moins une fois par semaine. |
| **Background Sync sans Service Worker actif** | Certains navigateurs mobiles n'exécutent pas le Background Sync lorsque l'application est complètement fermée. | La synchronisation reprend automatiquement au premier plan dès la réouverture de la PWA. |
| **Disque Éphémère Serveur (`/uploads`)** | Les fichiers téléchargés sur le serveur API sont stockés sur le disque local éphémère. | En environnement de production multi-instances (Docker/Kubernetes), configurer un stockage objet (S3/MinIO) pour le dossier des médias. |

---

## 7. Protocole de Test Manuel sur Appareil Réel (Mode Avion)

Pour valider le comportement sur un vrai téléphone (Android/iOS) en conditions réelles d'enrôlement terrain :

1. **Préparation (En Ligne) :**
   - Ouvrir la PWA CAPEF sur l'appareil.
   - Se connecter avec un compte Agent.
   - Attendre la confirmation `OFFLINE_READY` dans la barre de statut.
2. **Coupure Réseau (Mode Avion) :**
   - Activer le **Mode Avion** sur l'appareil (couper Wi-Fi et données mobiles).
   - Fermer complètement le navigateur.
3. **Saisie Hors-Ligne :**
   - Rouvrir la PWA CAPEF (vérifier l'affichage du bandeau jaune "Hors Ligne").
   - Créer un membre (ex: Personne Physique "Beti Paul").
   - Compléter le questionnaire d'activité (ex: Agriculteur -> Céréales -> Maïs).
   - Ajouter 2 lignes de production.
   - Consulter la fiche membre créée (vérifier l'affichage du macaron "En attente de synchro").
4. **Reconnexion & Synchronisation :**
   - Désactiver le Mode Avion.
   - Appuyer sur "Lancer la Synchronisation" ou laisser le Sync Engine automatique s'exécuter.
   - Vérifier le message de confirmation "3 opération(s) synchronisée(s) avec succès".
   - Vérifier la mise à jour du matricule officiel (ex: `CAPEF-AGR-XXXXX`) et du statut `synced`.
