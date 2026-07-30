import { db, membersTable, memberActivitiesTable, activityLineItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function migrateExistingMembersToActivities(): Promise<void> {
  try {
    logger.info("Checking if existing members need migration to new activity tables...");

    // Fetch all members
    const allMembers = await db.select().from(membersTable);
    if (allMembers.length === 0) {
      logger.info("No members found. Skipping migration.");
      return;
    }

    let migratedCount = 0;

    for (const member of allMembers) {
      // Check if this member already has any activities
      const existingActivities = await db
        .select()
        .from(memberActivitiesTable)
        .where(eq(memberActivitiesTable.memberId, member.id))
        .limit(1);

      if (existingActivities.length > 0) {
        continue; // already has activity data, skip
      }

      logger.info(`Migrating member ID ${member.id} (${member.memberNumber})...`);

      // Create a primary activity row
      const [insertedActivity] = await db
        .insert(memberActivitiesTable)
        .values({
          memberId: member.id,
          activityType: member.category, // e.g. agriculteur, pecheur, eleveur, forestier, artisan
          isPrimary: true,
          regionId: member.regionId,
          departmentId: member.departmentId,
          arrondissementId: member.arrondissementId,
          village: member.village,
          maillons: (member.categoryData as any)?.maillon || (member.categoryData as any)?.maillons || [],
        })
        .returning();

      // Extract existing flat category data to populate a default activity line item
      const catData = (member.categoryData as any) || {};

      if (member.category === "agriculteur") {
        await db.insert(activityLineItemsTable).values({
          activityId: insertedActivity.id,
          cropCategory: catData.cropCategory || catData.categorieCulture || null,
          cropName: catData.cropName || catData.culturePrincipale || null,
          cultureType: catData.cultureType || catData.typeCulture || null,
          superficieHa: catData.superficieHa ? parseFloat(catData.superficieHa) : null,
          productionQuantity: catData.productionQuantity ? parseFloat(catData.productionQuantity) : null,
          productionUnit: catData.productionUnit || null,
          productionFcfa: catData.productionFcfa ? parseFloat(catData.productionFcfa) : null,
          isPrincipalCrop: true,
        });
      } else if (member.category === "pecheur") {
        await db.insert(activityLineItemsTable).values({
          activityId: insertedActivity.id,
          speciesPêche: catData.species || catData.especePrincipale || null,
          productionQuantity: catData.productionQuantity || null,
          productionUnit: catData.productionUnit || null,
          productionFcfa: catData.productionFcfa || null,
        });
      } else if (member.category === "eleveur") {
        // Build products JSON from existing fields if any
        const products = [];
        if (catData.productName || catData.productionType) {
          products.push({
            name: catData.productName || catData.productionType,
            quantity: catData.productionQuantity || null,
            unit: catData.productionUnit || null,
            fcfa: catData.productionFcfa || null,
          });
        }
        await db.insert(activityLineItemsTable).values({
          activityId: insertedActivity.id,
          species: catData.species || catData.especeElevee || null,
          cheptelSize: catData.cheptelSize || catData.tailleCheptel || null,
          foodType: catData.foodType || catData.typeNourriture || null,
          products: products.length > 0 ? products : null,
        });
      } else if (member.category === "forestier") {
        await db.insert(activityLineItemsTable).values({
          activityId: insertedActivity.id,
          subCategory: catData.subCategory || null,
          essence: catData.essence || catData.essenceForestiere || null,
          plantationType: catData.plantationType || null,
          superficieHa: catData.superficieHa ? parseFloat(catData.superficieHa) : null,
          productionQuantity: catData.productionQuantity || null,
          productionUnit: catData.productionUnit || null,
          productionFcfa: catData.productionFcfa || null,
        });
      } else if (member.category === "artisan") {
        await db.insert(activityLineItemsTable).values({
          activityId: insertedActivity.id,
          artisanatProducts: catData.products || catData.produitsArtisanat || null,
          rawMaterials: catData.rawMaterials || catData.matieresPremieres || null,
          productionQuantity: catData.productionQuantity || null,
          productionUnit: catData.productionUnit || null,
          productionFcfa: catData.productionFcfa || null,
        });
      }

      migratedCount++;
    }

    logger.info(`Migration complete: ${migratedCount} members migrated to activity-based records.`);
  } catch (error) {
    logger.error({ error }, "Error migrating existing members to activity-based records");
  }
}
