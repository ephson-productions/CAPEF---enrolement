import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface MemberBadgePdfData {
  memberNumber: string;
  displayName: string;
  memberType: string;
  category: string;
  regionName?: string | null;
  departmentName?: string | null;
  arrondissementName?: string | null;
  phone?: string | null;
  issuedAt?: string | null;
  token?: string | null;
}

/**
 * Standard ISO/IEC 7810 ID-1 / CR80 dimensions in PostScript points:
 * 85.60 mm × 53.98 mm = ~242.64 pt × 153.02 pt
 */
export const CR80_WIDTH = 242.64;
export const CR80_HEIGHT = 153.02;

const CATEGORY_COLORS: Record<string, { label: string; primary: [number, number, number]; bg: [number, number, number] }> = {
  agriculteur: { label: "AGRICULTEUR", primary: [0.12, 0.56, 0.24], bg: [0.90, 0.96, 0.92] },
  pecheur: { label: "PÊCHEUR", primary: [0.10, 0.45, 0.82], bg: [0.91, 0.94, 0.99] },
  eleveur: { label: "ÉLEVEUR", primary: [0.77, 0.13, 0.12], bg: [0.99, 0.91, 0.90] },
  forestier: { label: "FORESTIER", primary: [0.95, 0.60, 0.0], bg: [0.99, 0.97, 0.88] },
  artisan: { label: "ARTISAN", primary: [0.42, 0.13, 0.66], bg: [0.95, 0.91, 1.0] },
};

/**
 * Generates an official, printable two-page (Recto and Verso) ISO/IEC 7810 ID-1 / CR80 PDF badge.
 */
export async function generateMemberBadgePdf(
  memberData: MemberBadgePdfData,
  qrBuffer?: Buffer | null,
  logoBuffer?: Buffer | null,
  photoBuffer?: Buffer | null,
  signatureBuffer?: Buffer | null
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const theme = CATEGORY_COLORS[memberData.category?.toLowerCase()] || {
    label: (memberData.category || "MEMBRE").toUpperCase(),
    primary: [0.05, 0.35, 0.21],
    bg: [0.94, 0.95, 0.96],
  };

  // Embed optional images
  let qrImage: any = null;
  if (qrBuffer && qrBuffer.length > 0) {
    try {
      qrImage = await pdfDoc.embedPng(qrBuffer);
    } catch {
      try { qrImage = await pdfDoc.embedJpg(qrBuffer); } catch {}
    }
  }

  let logoImage: any = null;
  if (logoBuffer && logoBuffer.length > 0) {
    try {
      logoImage = await pdfDoc.embedPng(logoBuffer);
    } catch {
      try { logoImage = await pdfDoc.embedJpg(logoBuffer); } catch {}
    }
  }

  let photoImage: any = null;
  if (photoBuffer && photoBuffer.length > 0) {
    try {
      photoImage = await pdfDoc.embedJpg(photoBuffer);
    } catch {
      try { photoImage = await pdfDoc.embedPng(photoBuffer); } catch {}
    }
  }

  let signatureImage: any = null;
  if (signatureBuffer && signatureBuffer.length > 0) {
    try {
      signatureImage = await pdfDoc.embedPng(signatureBuffer);
    } catch {
      try { signatureImage = await pdfDoc.embedJpg(signatureBuffer); } catch {}
    }
  }

  // ==========================================
  // PAGE 1: RECTO
  // ==========================================
  const rectoPage = pdfDoc.addPage([CR80_WIDTH, CR80_HEIGHT]);

  // Background gradient/fill
  rectoPage.drawRectangle({
    x: 0,
    y: 0,
    width: CR80_WIDTH,
    height: CR80_HEIGHT,
    color: rgb(1, 1, 1),
  });

  // Top header background
  rectoPage.drawRectangle({
    x: 0,
    y: CR80_HEIGHT - 28,
    width: CR80_WIDTH,
    height: 28,
    color: rgb(0.96, 0.98, 0.96),
  });

  // Dual tricolor flag stripe (green, red, yellow)
  const stripeY = CR80_HEIGHT - 29;
  rectoPage.drawRectangle({ x: 0, y: stripeY, width: CR80_WIDTH / 3, height: 2, color: rgb(0, 0.35, 0.21) });
  rectoPage.drawRectangle({ x: CR80_WIDTH / 3, y: stripeY, width: CR80_WIDTH / 3, height: 2, color: rgb(0.88, 0.11, 0.15) });
  rectoPage.drawRectangle({ x: (CR80_WIDTH / 3) * 2, y: stripeY, width: CR80_WIDTH / 3, height: 2, color: rgb(0.99, 0.80, 0.04) });

  // Official Country Header (Left: FR, Center: Logo, Right: EN)
  rectoPage.drawText("RÉPUBLIQUE DU CAMEROUN", { x: 8, y: CR80_HEIGHT - 9, size: 4.2, font: fontBold, color: rgb(0, 0.35, 0.21) });
  rectoPage.drawText("Paix - Travail - Patrie", { x: 14, y: CR80_HEIGHT - 15, size: 3.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  rectoPage.drawText("CHAMBRE D'AGRICULTURE, DES PÊCHES,", { x: 8, y: CR80_HEIGHT - 21, size: 3.2, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  rectoPage.drawText("DE L'ÉLEVAGE ET DES FORÊTS", { x: 12, y: CR80_HEIGHT - 26, size: 3.2, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

  if (logoImage) {
    rectoPage.drawImage(logoImage, {
      x: CR80_WIDTH / 2 - 11,
      y: CR80_HEIGHT - 26,
      width: 22,
      height: 22,
    });
  }

  rectoPage.drawText("REPUBLIC OF CAMEROON", { x: CR80_WIDTH - 66, y: CR80_HEIGHT - 9, size: 4.2, font: fontBold, color: rgb(0.88, 0.11, 0.15) });
  rectoPage.drawText("Peace - Work - Fatherland", { x: CR80_WIDTH - 64, y: CR80_HEIGHT - 15, size: 3.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  rectoPage.drawText("CHAMBER OF AGRICULTURE, FISHERIES,", { x: CR80_WIDTH - 76, y: CR80_HEIGHT - 21, size: 3.2, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  rectoPage.drawText("LIVESTOCK AND FORESTS", { x: CR80_WIDTH - 60, y: CR80_HEIGHT - 26, size: 3.2, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

  // Consular Banner
  rectoPage.drawRectangle({
    x: 6,
    y: CR80_HEIGHT - 40,
    width: CR80_WIDTH - 12,
    height: 9,
    color: rgb(0, 0.35, 0.21),
  });
  rectoPage.drawText("CARTE D'ENRÔLEMENT CONSULAIRE / REGISTRATION CARD", {
    x: 24,
    y: CR80_HEIGHT - 36.5,
    size: 4.8,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // Photo Box (Left)
  const photoX = 10;
  const photoY = 28;
  const photoW = 54;
  const photoH = 68;

  rectoPage.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
    color: rgb(theme.bg[0], theme.bg[1], theme.bg[2]),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
  });

  if (photoImage) {
    rectoPage.drawImage(photoImage, {
      x: photoX + 1,
      y: photoY + 1,
      width: photoW - 2,
      height: photoH - 2,
    });
  } else {
    rectoPage.drawText(memberData.displayName?.charAt(0)?.toUpperCase() || "C", {
      x: photoX + 20,
      y: photoY + 24,
      size: 26,
      font: fontBold,
      color: rgb(theme.primary[0], theme.primary[1], theme.primary[2]),
    });
  }

  // Category Badge below photo
  rectoPage.drawRectangle({
    x: photoX,
    y: photoY - 12,
    width: photoW,
    height: 10,
    color: rgb(theme.primary[0], theme.primary[1], theme.primary[2]),
  });
  rectoPage.drawText(theme.label, {
    x: photoX + (photoW - fontBold.widthOfTextAtSize(theme.label, 5)) / 2,
    y: photoY - 8.5,
    size: 5,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // Member Information details (Right)
  const infoX = 72;
  let cursorY = CR80_HEIGHT - 50;

  // Member Name
  rectoPage.drawText("NOM & PRÉNOM / FULL NAME", { x: infoX, y: cursorY, size: 4, font: fontRegular, color: rgb(0.45, 0.45, 0.45) });
  cursorY -= 7;
  const cleanName = (memberData.displayName || "").toUpperCase();
  const truncatedName = cleanName.length > 26 ? cleanName.slice(0, 26) + "..." : cleanName;
  rectoPage.drawText(truncatedName, { x: infoX, y: cursorY, size: 7, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

  // Member Number Box
  cursorY -= 15;
  rectoPage.drawRectangle({
    x: infoX,
    y: cursorY - 3,
    width: 108,
    height: 13,
    color: rgb(0.95, 0.96, 0.97),
    borderColor: rgb(0.85, 0.87, 0.9),
    borderWidth: 0.8,
  });
  rectoPage.drawText("N° MEMBRE / ID:", { x: infoX + 4, y: cursorY + 2, size: 4.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  rectoPage.drawText(memberData.memberNumber || "PENDING", { x: infoX + 46, y: cursorY + 1.5, size: 6.5, font: fontBold, color: rgb(0.05, 0.15, 0.35) });

  // Phone & Contacts
  cursorY -= 12;
  rectoPage.drawText("TÉLÉPHONE / CONTACT:", { x: infoX, y: cursorY, size: 4, font: fontRegular, color: rgb(0.45, 0.45, 0.45) });
  rectoPage.drawText(memberData.phone || "-", { x: infoX + 48, y: cursorY, size: 4.5, font: fontBold, color: rgb(0, 0.35, 0.21) });

  // Geographic Cascade (Region & Department)
  cursorY -= 10;
  rectoPage.drawText("RÉGION:", { x: infoX, y: cursorY, size: 4, font: fontRegular, color: rgb(0.45, 0.45, 0.45) });
  rectoPage.drawText(memberData.regionName || "-", { x: infoX + 24, y: cursorY, size: 4.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

  rectoPage.drawText("DÉPARTEMENT:", { x: infoX + 70, y: cursorY, size: 4, font: fontRegular, color: rgb(0.45, 0.45, 0.45) });
  rectoPage.drawText(memberData.departmentName || "-", { x: infoX + 104, y: cursorY, size: 4.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

  // Enrollment Date
  cursorY -= 10;
  const issuedDateStr = memberData.issuedAt
    ? new Date(memberData.issuedAt).toLocaleDateString("fr-FR")
    : new Date().toLocaleDateString("fr-FR");
  rectoPage.drawText(`DATE D'ENRÔLEMENT: ${issuedDateStr}`, { x: infoX, y: cursorY, size: 4.5, font: fontBold, color: rgb(0.65, 0.35, 0.05) });

  // Verification QR code (Top-Right inside Recto)
  if (qrImage) {
    const qrSize = 42;
    const qrX = CR80_WIDTH - qrSize - 10;
    const qrY = 16;
    rectoPage.drawRectangle({
      x: qrX - 2,
      y: qrY - 2,
      width: qrSize + 4,
      height: qrSize + 4,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.8,
    });
    rectoPage.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    rectoPage.drawText("SCAN VERIFICATION", { x: qrX + 2, y: qrY - 6, size: 3.5, font: fontBold, color: rgb(0, 0.35, 0.21) });
  }

  // Sceau & Signature du Secrétariat Général
  rectoPage.drawText("Secrétariat Général CAPEF", { x: infoX, y: 10, size: 3.5, font: fontBold, color: rgb(0.05, 0.35, 0.21) });

  // ==========================================
  // PAGE 2: VERSO
  // ==========================================
  const versoPage = pdfDoc.addPage([CR80_WIDTH, CR80_HEIGHT]);

  // White background
  versoPage.drawRectangle({
    x: 0,
    y: 0,
    width: CR80_WIDTH,
    height: CR80_HEIGHT,
    color: rgb(0.99, 0.99, 0.99),
  });

  // Top tricolor stripe
  versoPage.drawRectangle({ x: 0, y: CR80_HEIGHT - 3, width: CR80_WIDTH / 3, height: 3, color: rgb(0, 0.35, 0.21) });
  versoPage.drawRectangle({ x: CR80_WIDTH / 3, y: CR80_HEIGHT - 3, width: CR80_WIDTH / 3, height: 3, color: rgb(0.88, 0.11, 0.15) });
  versoPage.drawRectangle({ x: (CR80_WIDTH / 3) * 2, y: CR80_HEIGHT - 3, width: CR80_WIDTH / 3, height: 3, color: rgb(0.99, 0.80, 0.04) });

  // Verso title
  versoPage.drawText("CONDITIONS D'UTILISATION / TERMS OF USE", {
    x: 44,
    y: CR80_HEIGHT - 14,
    size: 5.5,
    font: fontBold,
    color: rgb(0, 0.35, 0.21),
  });

  // Regulatory text lines (French & English)
  const regulations = [
    "1. Cette carte consulaire est strictement personnelle, incessible et demeure la propriété de la CAPEF.",
    "2. Elle atteste de l'inscription au registre consulaire national de la Chambre au Cameroun.",
    "3. Le titulaire s'engage à respecter scrupuleusement les statuts, chartes et règlements consulaires.",
    "4. En cas de perte ou vol, informer immédiatement la délégation régionale CAPEF de votre ressort.",
    "5. Les autorités publiques sont priées de faciliter l'accès du titulaire aux services de développement.",
    "--------------------------------------------------------------------------------------------------------",
    "1. This consular registration card is strictly personal and non-transferable property of CAPEF.",
    "2. It certifies official entry in the National Consular Registry of the Chamber in Cameroon.",
    "3. Public authorities are kindly requested to facilitate holder's access to consular assistance.",
  ];

  let regY = CR80_HEIGHT - 24;
  for (const line of regulations) {
    versoPage.drawText(line, {
      x: 10,
      y: regY,
      size: 3.6,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.25),
    });
    regY -= 6.5;
  }

  // Bottom Signature Areas
  // Left: Member signature
  const sigBoxW = 70;
  const sigBoxH = 24;
  versoPage.drawText("SIGNATURE DU TITULAIRE / HOLDER", { x: 12, y: 36, size: 3.5, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
  versoPage.drawRectangle({
    x: 12,
    y: 10,
    width: sigBoxW,
    height: sigBoxH,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.6,
  });

  if (signatureImage) {
    versoPage.drawImage(signatureImage, {
      x: 14,
      y: 11,
      width: sigBoxW - 4,
      height: sigBoxH - 2,
    });
  }

  // Center: CAPEF Address
  versoPage.drawText("CHAMBRE D'AGRICULTURE, DES PÊCHES,", { x: 90, y: 26, size: 3.5, font: fontBold, color: rgb(0, 0.35, 0.21) });
  versoPage.drawText("DE L'ÉLEVAGE ET DES FORÊTS DU CAMEROUN", { x: 86, y: 20, size: 3.2, font: fontBold, color: rgb(0, 0.35, 0.21) });
  versoPage.drawText("BP 287 Yaoundé — contact@capef.cm", { x: 98, y: 14, size: 3.2, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  // Right: President Signature & Stamp
  versoPage.drawText("LE PRÉSIDENT / PRESIDENT", { x: CR80_WIDTH - 65, y: 36, size: 3.5, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
  versoPage.drawCircle({
    x: CR80_WIDTH - 35,
    y: 20,
    size: 10,
    borderColor: rgb(0.8, 0.1, 0.1),
    borderWidth: 0.8,
  });
  versoPage.drawText("CAPEF", { x: CR80_WIDTH - 42, y: 19, size: 4, font: fontBold, color: rgb(0.8, 0.1, 0.1) });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
