# CAPEF Digital Enrôlement — PWA Agropastorale Offline-First

PWA d'enrôlement et de recensement digital des acteurs agropastoraux du Cameroun (CAPEF), fonctionnant en mode local-first hors-ligne avec synchronisation réseau résiliente.

## Run & Operate

- `pnpm --filter capef run dev` — run the Vite React PWA frontend (port 3000)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all workspace packages
- `pnpm --filter capef test -- --run` — run frontend Vitest suites
- `cd artifacts/api-server && pnpm exec vitest run` — run backend Vitest integration suites
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from `lib/api-spec/openapi.yaml`
- `pnpm db:migrate` — execute standalone CLI Drizzle migrations and seed geographic reference data
- Required env: `DATABASE_URL` — Postgres connection string (port 6543 pooler), `DIRECT_URL` — Postgres direct DDL connection string (port 5432)

## Stack

- Monorepo pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18, Vite, Workbox PWA Service Worker, Dexie.js (IndexedDB v4), Wouter routing, i18next
- API: Express 5, `@clerk/express`, Pino logger
- DB: PostgreSQL + Drizzle ORM + Drizzle Migrations (`lib/db/drizzle/`)
- Validation: Zod (`zod/v4`), `@workspace/activity-rules`
- API codegen: Orval (driven strictly from `lib/api-spec/openapi.yaml`)

## Where things live

- `artifacts/capef` — React PWA frontend application
- `artifacts/api-server` — Express backend API server
- `lib/api-spec/openapi.yaml` — Source of truth OpenAPI 3.0 specification
- `lib/api-zod` & `lib/api-client-react` — Generated Zod schemas and TanStack Query React hooks
- `lib/db/src/schema` — Drizzle PostgreSQL database schema definitions
- `docs/offline.md` — Offline-first architecture, local data model, and sync guide

## Architecture decisions

- **ID Namespace Disambiguation:** Strictly separates Dexie internal auto-increment primary key (`id`), client offline UUID (`localId`), and backend PostgreSQL primary key (`serverId`). REST API URLs strictly use `serverId`.
- **Local-First Repository & Persistence:** All reads/writes pass through `MemberRepository` and Dexie.js IndexedDB v4. React Query acts solely as a reactive cache projection.
- **Web Locks Multi-Tab Sync Locking:** `syncEngine.ts` uses Web Locks API (`capef_sync_engine_lock`) to guarantee single-tab queue processing.
- **WebCrypto PBKDF2 Offline PIN Auth:** `LocalProfileService` implements local user profile caching and 100,000-iteration PBKDF2 PIN unlock with a 21-day TTL without storing raw secrets.
- **Binary Blob Media Storage:** Canvas HTML5 client-side compression converts images to binary Blobs stored in Dexie `db.media`. Blobs are uploaded via `/api/media/upload` prior to submitting enrollment payloads.
- **Optimistic Concurrency Control (OCC 409):** `version` columns on members/activities enforce atomic version checking. HTTP 409 conflicts present an interactive 3-way resolution modal (Conserver la mienne, Prendre la version serveur, Modifier puis rejouer).

## Gotchas

- **Never edit generated files:** Never manually modify files inside `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/`. Always edit `lib/api-spec/openapi.yaml` and run `pnpm --filter @workspace/api-spec run codegen`.
- **Never use Dexie `.id` in REST URLs:** Always use `member.serverId` or `activity.serverId` for API endpoints.
- **Never wipe IndexedDB operations:** Queue operations are strictly preserved until confirmed server 200/201 acknowledgment or explicit user cancellation.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
