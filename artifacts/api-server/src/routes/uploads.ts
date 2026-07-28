import { Router, type IRouter } from "express";
import * as fs from "fs";
import * as path from "path";
import { requireAppUser } from "../lib/auth";

const router: IRouter = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// POST /api/uploads — accept base64-encoded file, store to disk, return URL
router.post("/uploads", requireAppUser, async (req, res): Promise<void> => {
  const { base64Data, mimeType, fileName } = req.body;

  if (!base64Data || !mimeType || !fileName) {
    res.status(400).json({ error: "base64Data, mimeType et fileName sont requis" });
    return;
  }

  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(mimeType)) {
    res.status(400).json({ error: "Type de fichier non autorisé" });
    return;
  }

  try {
    const ext = mimeType.split("/")[1] ?? "jpg";
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, safeName);

    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(filePath, buffer);

    // Return a data URL so it works without object storage in first build
    const url = `data:${mimeType};base64,${base64Data}`;

    res.json({ url, fileName: safeName });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur lors de l'enregistrement du fichier" });
  }
});

export default router;
