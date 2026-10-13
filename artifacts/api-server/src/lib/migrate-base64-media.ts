import { createClient } from "@supabase/supabase-js";
import { db, membersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    return createClient(supabaseUrl, supabaseKey);
  }
  return null;
}

/**
 * Uploads a base64 Data URL to Supabase Storage and returns the object path (e.g. member-documents/...).
 */
async function uploadBase64ToStorage(supabase: any, dataUrl: string, prefix: string): Promise<string | null> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl;

  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return dataUrl;

    const mimeType = match[1];
    const cleanBase64 = match[2];
    const buffer = Buffer.from(cleanBase64, "base64");

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      logger.warn({ prefix, size: buffer.length }, "Base64 string exceeds 10MB limit. Skipping upload.");
      return dataUrl;
    }

    const ext = mimeType.split("/")[1] ?? "jpg";
    const safeName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const bucketName = "member-documents";

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(safeName, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      logger.error({ error, safeName }, "Failed to upload inline base64 image to Supabase Storage");
      return dataUrl; // Retain original if upload failed
    }

    return safeName; // Return clean object path
  } catch (err) {
    logger.error({ err }, "Exception during base64 migration upload");
    return dataUrl;
  }
}

/**
 * Idempotent migration runner scanning members table for inline base64/Data URLs in JSONB columns,
 * uploading them to Supabase Storage, and updating records with object paths.
 */
export async function migrateLegacyBase64Media(): Promise<{ scanned: number; migrated: number; errors: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.log("ℹ️ Supabase credentials missing. Legacy base64 migration skipped.");
    return { scanned: 0, migrated: 0, errors: 0 };
  }

  console.log("🚀 Starting idempotent legacy base64 media migration...");

  // Scan rows where physiqueData, moraleData, or badgeUrl contain inline base64 'data:'
  const rows = await db
    .select({
      id: membersTable.id,
      badgeUrl: membersTable.badgeUrl,
      physiqueData: membersTable.physiqueData,
      moraleData: membersTable.moraleData,
    })
    .from(membersTable)
    .where(
      sql`(${membersTable.badgeUrl} LIKE 'data:%' OR ${membersTable.physiqueData}::text LIKE '%data:%' OR ${membersTable.moraleData}::text LIKE '%data:%')`
    );

  console.log(`🔍 Found ${rows.length} member records with legacy inline base64 data.`);

  let migratedCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      let modified = false;
      const updates: Record<string, any> = {};

      if (row.badgeUrl && row.badgeUrl.startsWith("data:")) {
        const path = await uploadBase64ToStorage(supabase, row.badgeUrl, `badge_m${row.id}`);
        if (path && path !== row.badgeUrl) {
          updates.badgeUrl = path;
          modified = true;
        }
      }

      if (row.physiqueData && typeof row.physiqueData === "object") {
        const phys = { ...(row.physiqueData as any) };
        if (phys.photoUrl && phys.photoUrl.startsWith("data:")) {
          const path = await uploadBase64ToStorage(supabase, phys.photoUrl, `photo_m${row.id}`);
          if (path && path !== phys.photoUrl) { phys.photoUrl = path; modified = true; }
        }
        if (phys.cniRectoUrl && phys.cniRectoUrl.startsWith("data:")) {
          const path = await uploadBase64ToStorage(supabase, phys.cniRectoUrl, `cni_recto_m${row.id}`);
          if (path && path !== phys.cniRectoUrl) { phys.cniRectoUrl = path; modified = true; }
        }
        if (phys.cniVersoUrl && phys.cniVersoUrl.startsWith("data:")) {
          const path = await uploadBase64ToStorage(supabase, phys.cniVersoUrl, `cni_verso_m${row.id}`);
          if (path && path !== phys.cniVersoUrl) { phys.cniVersoUrl = path; modified = true; }
        }
        if (phys.signatureUrl && phys.signatureUrl.startsWith("data:")) {
          const path = await uploadBase64ToStorage(supabase, phys.signatureUrl, `sig_m${row.id}`);
          if (path && path !== phys.signatureUrl) { phys.signatureUrl = path; modified = true; }
        }
        if (modified) updates.physiqueData = phys;
      }

      if (row.moraleData && typeof row.moraleData === "object") {
        const morale = { ...(row.moraleData as any) };
        if (morale.logoUrl && morale.logoUrl.startsWith("data:")) {
          const path = await uploadBase64ToStorage(supabase, morale.logoUrl, `logo_m${row.id}`);
          if (path && path !== morale.logoUrl) { morale.logoUrl = path; modified = true; }
        }
        if (modified) updates.moraleData = morale;
      }

      if (modified) {
        await db.update(membersTable).set(updates).where(eq(membersTable.id, row.id));
        migratedCount++;
      }
    } catch (err) {
      console.error(`❌ Error migrating member ID ${row.id}:`, err);
      errorCount++;
    }
  }

  console.log(`✅ Base64 migration completed. Scanned: ${rows.length}, Migrated: ${migratedCount}, Errors: ${errorCount}`);
  return { scanned: rows.length, migrated: migratedCount, errors: errorCount };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateLegacyBase64Media()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Fatal migration error:", err);
      process.exit(1);
    });
}
