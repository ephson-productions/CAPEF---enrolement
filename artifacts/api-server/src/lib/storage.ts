import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

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
 * Given a media path or URL, if it represents a Supabase storage path
 * (or object key in member-documents bucket), resolve a fresh 1-hour signed URL.
 * If it's already an absolute external URL or data URL, return it as-is.
 */
export async function resolveSignedMediaUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null;

  // If it's a data URL, placeholder, or full HTTP URL, return as-is
  if (pathOrUrl.startsWith("data:") || pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return pathOrUrl;

    const bucketName = "member-documents";
    // Strip bucket prefix if present
    const cleanPath = pathOrUrl.startsWith(`${bucketName}/`)
      ? pathOrUrl.slice(bucketName.length + 1)
      : pathOrUrl;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(cleanPath, 3600);

    if (error || !data) {
      logger.warn({ error, cleanPath }, "Could not resolve signed URL for media path");
      return pathOrUrl;
    }

    return data.signedUrl;
  } catch (err) {
    logger.error({ err, pathOrUrl }, "Error resolving signed media URL");
    return pathOrUrl;
  }
}

/**
 * Resolves media paths inside member JSON data structures (physiqueData, moraleData, badgeUrl)
 * on-the-fly when returning member details to clients.
 */
export async function resolveMemberMediaUrls(member: any): Promise<any> {
  if (!member) return member;

  const resolved = { ...member };

  if (resolved.badgeUrl && !resolved.badgeUrl.startsWith("data:")) {
    resolved.badgeUrl = await resolveSignedMediaUrl(resolved.badgeUrl);
  }

  if (resolved.physiqueData && typeof resolved.physiqueData === "object") {
    const phys = { ...resolved.physiqueData };
    if (phys.photoUrl) phys.photoUrl = await resolveSignedMediaUrl(phys.photoUrl);
    if (phys.cniRectoUrl) phys.cniRectoUrl = await resolveSignedMediaUrl(phys.cniRectoUrl);
    if (phys.cniVersoUrl) phys.cniVersoUrl = await resolveSignedMediaUrl(phys.cniVersoUrl);
    if (phys.signatureUrl) phys.signatureUrl = await resolveSignedMediaUrl(phys.signatureUrl);
    resolved.physiqueData = phys;
  }

  if (resolved.moraleData && typeof resolved.moraleData === "object") {
    const morale = { ...resolved.moraleData };
    if (morale.logoUrl) morale.logoUrl = await resolveSignedMediaUrl(morale.logoUrl);
    resolved.moraleData = morale;
  }

  return resolved;
}
