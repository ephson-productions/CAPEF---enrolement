import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAppUser } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

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

// POST /api/uploads — accept base64-encoded file, upload to Supabase Storage bucket, return URL
router.post("/uploads", requireAppUser, async (req, res): Promise<void> => {
  const { base64Data, mimeType, fileName } = req.body;

  if (!base64Data || !mimeType || !fileName) {
    res.status(400).json({ error: "base64Data, mimeType et fileName sont requis" });
    return;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  if (!allowedTypes.includes(mimeType.toLowerCase())) {
    res.status(400).json({ error: "Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WEBP, PDF." });
    return;
  }

  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    res.status(400).json({ error: "La taille du fichier dépasse la limite autorisée de 5 Mo." });
    return;
  }

  const ext = mimeType.split("/")[1] ?? "jpg";
  const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;

  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      logger.error("Supabase Storage configuration missing (SUPABASE_URL or keys not set)");
      res.status(503).json({
        error: "Le service de stockage de fichiers est indisponible. Veuillez vérifier la configuration serveur.",
        code: "STORAGE_NOT_CONFIGURED"
      });
      return;
    }

    const bucketName = "member-documents";
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(safeName, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      logger.error({ error }, "Failed to upload file to Supabase Storage");
      throw error;
    }

    // Generate a private short-lived signed URL (3600s = 1 hour) instead of a permanent public URL
    const { data: signedUrlData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(safeName, 3600);

    if (signedError || !signedUrlData) {
      logger.error({ signedError }, "Failed to generate signed URL");
      throw signedError || new Error("Failed to generate signed URL");
    }

    res.json({ url: signedUrlData.signedUrl, path: safeName, fileName: safeName });
  } catch (err: any) {
    logger.error({ err }, "Error processing file upload");
    res.status(500).json({ error: "Erreur lors de l'enregistrement du fichier" });
  }
});

export default router;
