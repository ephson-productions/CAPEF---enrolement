import { vi } from "vitest";
import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import * as dbSchema from "@workspace/db/schema";

process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/capef_test";

const memDb = newDb();

const pgMemClient = memDb.adapters.createPg();

// Bridge pg-mem query behavior with drizzle-orm node-postgres driver
const origQuery = pgMemClient.Client.prototype.query;
pgMemClient.Client.prototype.query = function (config: any, values: any, callback: any) {
  let cb = typeof values === "function" ? values : typeof callback === "function" ? callback : undefined;
  let params = Array.isArray(values) ? values : undefined;

  if (typeof config === "object" && config) {
    const sqlText = config.text;
    const sqlValues = config.values || params || [];
    delete config.types;
    if (config.rowMode === "array") {
      delete config.rowMode;
      const promise = origQuery.call(this, sqlText, sqlValues).then((res: any) => {
        if (res && res.rows) {
          res.rows = res.rows.map((row: any) => Object.values(row));
        }
        return res;
      });
      if (cb) {
        promise.then((r: any) => cb(null, r)).catch((e: any) => cb(e));
      }
      return promise;
    }
    return origQuery.call(this, sqlText, sqlValues, cb);
  }
  return origQuery.apply(this, arguments as any);
};

// Initialize tables in pg-mem database instance
memDb.public.none(`
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    clerk_user_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent',
    status TEXT NOT NULL DEFAULT 'active',
    region_id INTEGER,
    cni_number TEXT,
    cni_photo_url TEXT,
    profile_photo_url TEXT,
    assigned_zones JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE members (
    id SERIAL PRIMARY KEY,
    member_number TEXT NOT NULL UNIQUE,
    member_type TEXT NOT NULL,
    category TEXT NOT NULL,
    individual_or_org TEXT NOT NULL DEFAULT 'individuel',
    region_id INTEGER,
    department_id INTEGER,
    arrondissement_id INTEGER,
    village TEXT,
    gps_lat DOUBLE PRECISION,
    gps_lng DOUBLE PRECISION,
    created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    physique_data JSONB,
    morale_data JSONB,
    category_data JSONB,
    badge_url TEXT,
    badge_token TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'incomplet',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE member_activities (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    region_id INTEGER,
    department_id INTEGER,
    arrondissement_id INTEGER,
    village TEXT,
    maillons JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE activity_line_items (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER NOT NULL REFERENCES member_activities(id) ON DELETE CASCADE,
    parcelle_group_id TEXT,
    crop_category TEXT,
    crop_name TEXT,
    culture_type TEXT,
    superficie_ha DOUBLE PRECISION,
    production_quantity DOUBLE PRECISION,
    production_unit TEXT,
    production_fcfa DOUBLE PRECISION,
    is_principal_crop BOOLEAN DEFAULT true,
    parent_line_item_id INTEGER,
    species TEXT,
    cheptel_size INTEGER,
    food_type TEXT,
    products JSONB,
    species_peche TEXT,
    sub_category TEXT,
    essence TEXT,
    plantation_type TEXT,
    artisanat_products TEXT,
    raw_materials TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE processed_operations (
    client_operation_id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    operation_type TEXT NOT NULL,
    resource_id INTEGER,
    result_payload JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE SEQUENCE seq_member_number START WITH 1 INCREMENT BY 1;
`);

const testPool = new pgMemClient.Pool();
(testPool as any).options = {};

export const testDrizzle = drizzle(testPool, { schema: dbSchema });

// Mock @workspace/db so all routes & tests import pg-mem drizzle instance directly
vi.mock("@workspace/db", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    db: testDrizzle,
    pool: testPool,
  };
});

// Vitest mock for @clerk/express
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (req: any, res: any, next: any) => next(),
  publishableKeyFromHost: () => "pk_test_123",
  getClerkProxyHost: () => "localhost",
  getAuth: (req: any) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer test_user_")) {
      const clerkUserId = authHeader.replace("Bearer ", "").trim();
      return { userId: clerkUserId };
    }
    return { userId: null };
  },
  clerkClient: {
    invitations: {
      createInvitation: vi.fn().mockResolvedValue({ id: "inv_123" }),
    },
    users: {
      getUser: vi.fn().mockImplementation((id: string) => {
        const email = id === "admin_user" ? "admin@capef.cm" : `${id}@capef.test`;
        return Promise.resolve({
          id,
          primaryEmailAddress: { emailAddress: email },
          emailAddresses: [{ emailAddress: email }],
        });
      }),
      deleteUser: vi.fn().mockResolvedValue(true),
    },
  },
}));
