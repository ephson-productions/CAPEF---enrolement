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
 * Helper to extract a clean relative object path from a storage URL or path.
 * If given a full signed or public Supabase URL, strips origin, bucket prefix, and token query parameters.
 */
export function extractCleanStoragePath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("data:")) return pathOrUrl;

  try {
    let clean = pathOrUrl;
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      const parsed = new URL(clean);
      clean = parsed.pathname;
    }

    // Strip '/storage/v1/object/public/member-documents/' or '/storage/v1/object/sign/member-documents/'
    const bucketMatch = clean.match(/(?:member-documents\/)(.+)$/);
    if (bucketMatch && bucketMatch[1]) {
      clean = bucketMatch[1];
    }

    // Strip query parameters
    const queryIdx = clean.indexOf("?");
    if (queryIdx !== -1) {
      clean = clean.slice(0, queryIdx);
    }

    return clean;
  } catch (err) {
    return pathOrUrl;
  }
}

/**
 * Helper to sanitize strings for filesystem / storage object filenames.
 * Strips accents, removes special characters, and joins with single underscores.
 */
export function sanitizeForFileName(input: string | null | undefined, fallback = "MEMBER"): string {
  if (!input) return fallback;
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-zA-Z0-9]+/g, "_")  // replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, "")         // trim leading/trailing underscores
    .toUpperCase();
  return normalized || fallback;
}

/**
 * Converts a media path or URL (Supabase storage relative path, signed URL, or external URL)
 * into an inline base64 Data URL (e.g., `data:image/jpeg;base64,...`).
 * Useful for embedding media inside SVG documents so they render reliably offline and across browsers.
 */
export async function fetchAsBase64DataUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("data:")) return pathOrUrl;

  try {
    const signedOrOriginalUrl = await resolveSignedMediaUrl(pathOrUrl);
    if (!signedOrOriginalUrl) return null;

    const response = await fetch(signedOrOriginalUrl);
    if (!response.ok) {
      logger.warn({ status: response.status, pathOrUrl }, "Failed to fetch image for base64 conversion");
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Str = buffer.toString("base64");

    return `data:${contentType};base64,${base64Str}`;
  } catch (err) {
    logger.error({ err, pathOrUrl }, "Error fetching image as base64 data URL");
    return null;
  }
}

/**
 * Uploads a base64 data string to Supabase Storage bucket `member-documents`
 * and returns the relative file path. Throws an Error if storage is not configured or upload fails,
 * preventing silent fallback persistence of base64 strings in PostgreSQL.
 */
export async function uploadBase64ToStorage(
  base64Data: string,
  prefix = "media",
  context?: { memberName?: string; regionName?: string }
): Promise<string> {
  if (!base64Data) return base64Data;

  // If already a clean path or URL, extract clean path
  if (!base64Data.startsWith("data:")) {
    return extractCleanStoragePath(base64Data) || base64Data;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    if (process.env.NODE_ENV === "test") {
      return `mock_${prefix}_${Date.now()}.jpg`;
    }
    logger.error("Supabase client unavailable for base64 media upload");
    throw new Error("STORAGE_UNAVAILABLE: Service de stockage indisponible.");
  }

  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("INVALID_BASE64_FORMAT: Format de donnée image invalide.");
  }

  const mimeType = matches[1];
  const rawBase64 = matches[2];
  const buffer = Buffer.from(rawBase64, "base64");

  const ext = mimeType.split("/")[1] ?? "jpg";

  const safeMember = sanitizeForFileName(context?.memberName, "");
  const safeRegion = sanitizeForFileName(context?.regionName, "");
  const nameSuffix = [safeMember, safeRegion].filter(Boolean).join("_");

  const safeName = nameSuffix
    ? `${prefix}_${nameSuffix}_${Date.now()}.${ext}`
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;

  const bucketName = "member-documents";

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(safeName, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    logger.error({ error, safeName }, "Failed to upload base64 image to Supabase Storage");
    throw new Error(`STORAGE_UPLOAD_FAILED: ${error.message}`);
  }

  return safeName;
}

/**
 * Scans physiqueData and moraleData in member payloads for inline base64 images,
 * uploads them to Supabase Storage bucket `member-documents`, and replaces the base64
 * strings with clean relative storage paths.
 */
export async function processMemberPayloadMedia(
  payload: any,
  context?: { regionName?: string }
): Promise<any> {
  if (!payload || typeof payload !== "object") return payload;

  const processed = { ...payload };

  let memberName = "";
  if (processed.individualOrOrg === "morale" || processed.moraleData) {
    memberName = processed.moraleData?.nom ?? "";
  } else if (processed.physiqueData) {
    memberName = `${processed.physiqueData?.nom ?? ""} ${processed.physiqueData?.prenom ?? ""}`.trim();
  }

  const uploadContext = {
    memberName,
    regionName: context?.regionName ?? "",
  };

  if (processed.physiqueData && typeof processed.physiqueData === "object") {
    const phys = { ...processed.physiqueData };
    if (phys.photoUrl) {
      phys.photoUrl = await uploadBase64ToStorage(phys.photoUrl, "photo", uploadContext);
    }
    if (phys.cniRectoUrl) {
      phys.cniRectoUrl = await uploadBase64ToStorage(phys.cniRectoUrl, "cni_recto", uploadContext);
    }
    if (phys.cniVersoUrl) {
      phys.cniVersoUrl = await uploadBase64ToStorage(phys.cniVersoUrl, "cni_verso", uploadContext);
    }
    if (phys.signatureUrl) {
      phys.signatureUrl = await uploadBase64ToStorage(phys.signatureUrl, "signature", uploadContext);
    }
    processed.physiqueData = phys;
  }

  if (processed.moraleData && typeof processed.moraleData === "object") {
    const morale = { ...processed.moraleData };
    if (morale.certificatUrl) {
      morale.certificatUrl = await uploadBase64ToStorage(morale.certificatUrl, "certificat", uploadContext);
    }
    if (morale.logoUrl) {
      morale.logoUrl = await uploadBase64ToStorage(morale.logoUrl, "logo", uploadContext);
    }
    processed.moraleData = morale;
  }

  return processed;
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
    if (morale.certificatUrl) morale.certificatUrl = await resolveSignedMediaUrl(morale.certificatUrl);
    if (morale.logoUrl) morale.logoUrl = await resolveSignedMediaUrl(morale.logoUrl);
    resolved.moraleData = morale;
  }

  return resolved;
}
