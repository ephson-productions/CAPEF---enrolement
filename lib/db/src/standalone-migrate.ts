import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import {
  membersTable,
  memberActivitiesTable,
  activityLineItemsTable,
  regionsTable,
  departmentsTable,
  arrondissementsTable
} from "./schema/index";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.join(__dirname, "../drizzle");

const SEED_DATA = [
  {
    region: "Adamaoua",
    departments: [
      { name: "Vina", arrondissements: ["Ngaoundéré I", "Ngaoundéré II", "Ngaoundéré III", "Belel", "Nganha", "Nyambaka", "Martap"] },
      { name: "Mbéré", arrondissements: ["Meiganga", "Djohong", "Dir", "Ngaoui"] },
      { name: "Djérem", arrondissements: ["Tibati", "Ngaoundal"] },
      { name: "Mayo-Banyo", arrondissements: ["Banyo", "Bankim"] },
      { name: "Faro-et-Déo", arrondissements: ["Tignère", "Galim-Tignère"] }
    ]
  },
  {
    region: "Centre",
    departments: [
      { name: "Mfoundi", arrondissements: ["Yaoundé I", "Yaoundé II", "Yaoundé III", "Yaoundé IV", "Yaoundé V", "Yaoundé VI", "Yaoundé VII"] },
      { name: "Lekié", arrondissements: ["Monatélé", "Obala", "Evodoula", "Okola", "Sa'a"] },
      { name: "Méfou-et-Afamba", arrondissements: ["Mfou", "Awaé", "Soa"] },
      { name: "Nyong-et-So'o", arrondissements: ["Mbalmayo", "Dzeng"] }
    ]
  },
  {
    region: "Est",
    departments: [
      { name: "Kadey", arrondissements: ["Batouri", "Kette", "Ndelele"] },
      { name: "Lom-et-Djérem", arrondissements: ["Bertoua I", "Bertoua II", "Belabo", "Garoua-Boulaï"] }
    ]
  },
  {
    region: "Extrême-Nord",
    departments: [
      { name: "Diamaré", arrondissements: ["Maroua I", "Maroua II", "Maroua III", "Bogo", "Meri", "Dargala"] },
      { name: "Logone-et-Chari", arrondissements: ["Kousséri", "Makary", "Waza"] }
    ]
  },
  {
    region: "Littoral",
    departments: [
      { name: "Wouri", arrondissements: ["Douala I", "Douala II", "Douala III", "Douala IV", "Douala V", "Douala VI"] },
      { name: "Sanaga-Maritime", arrondissements: ["Édéa I", "Édéa II", "Dizangué", "Mouanko"] },
      { name: "Moungo", arrondissements: ["Nkongsamba I", "Nkongsamba II", "Melong", "Mbanga"] }
    ]
  },
  {
    region: "Nord",
    departments: [
      { name: "Bénoué", arrondissements: ["Garoua I", "Garoua II", "Garoua III", "Pitoa", "Lagdo"] },
      { name: "Mayo-Louti", arrondissements: ["Guider", "Figuil"] }
    ]
  },
  {
    region: "Nord-Ouest",
    departments: [
      { name: "Mezam", arrondissements: ["Bamenda I", "Bamenda II", "Bamenda III", "Bali", "Santa"] }
    ]
  },
  {
    region: "Ouest",
    departments: [
      { name: "Mifi", arrondissements: ["Bafoussam I", "Bafoussam II", "Bafoussam III"] },
      { name: "Bamboutos", arrondissements: ["Mbouda", "Galim", "Babadjou"] },
      { name: "Menoua", arrondissements: ["Dschang", "Santchou", "Fongo-Tongo"] },
      { name: "Noun", arrondissements: ["Foumban", "Foumbot", "Bangourain"] }
    ]
  },
  {
    region: "Sud",
    departments: [
      { name: "Mvila", arrondissements: ["Ebolowa I", "Ebolowa II", "Biwong-Bane", "Mengong"] },
      { name: "Océan", arrondissements: ["Kribi I", "Kribi II", "Lolodorf", "Akom II"] }
    ]
  },
  {
    region: "Sud-Ouest",
    departments: [
      { name: "Fako", arrondissements: ["Limbe I", "Limbe II", "Limbe III", "Buea", "Muyuka", "Tiko"] },
      { name: "Meme", arrondissements: ["Kumba I", "Kumba II", "Kumba III", "Mbonge"] }
    ]
  }
];

async function runStandaloneMigrateAndSeed() {
  let connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ Missing database connection string (DIRECT_URL or DATABASE_URL).");
    process.exit(1);
  }

  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    connectionString = url.toString();
  } catch (e) {
    // Ignore parsing errors
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const db = drizzle(pool);

  console.log("⏳ Running schema migrations from:", migrationsFolder);
  try {
    await migrate(db, { migrationsFolder });
    console.log("✅ Schema migrations applied successfully.");

    // Reference geographic seeding
    const existingRegions = await db.select().from(regionsTable).limit(1);
    if (existingRegions.length === 0) {
      console.log("🌱 Seeding database with Cameroon geographic data...");
      for (const rData of SEED_DATA) {
        const [insertedRegion] = await db
          .insert(regionsTable)
          .values({ name: rData.region })
          .returning();

        for (const dData of rData.departments) {
          const [insertedDept] = await db
            .insert(departmentsTable)
            .values({
              regionId: insertedRegion.id,
              name: dData.name
            })
            .returning();

          for (const arrName of dData.arrondissements) {
            await db
              .insert(arrondissementsTable)
              .values({
                departmentId: insertedDept.id,
                name: arrName
              });
          }
        }
      }
      console.log("✅ Geographic reference seeding complete.");
    } else {
      console.log("ℹ️ Geographic data already seeded.");
    }

    // Migrate legacy member records to activity structure if needed
    const allMembers = await db.select().from(membersTable);
    let migratedCount = 0;

    for (const member of allMembers) {
      const existingActivities = await db
        .select()
        .from(memberActivitiesTable)
        .where(eq(memberActivitiesTable.memberId, member.id))
        .limit(1);

      if (existingActivities.length > 0) continue;

      const [insertedActivity] = await db
        .insert(memberActivitiesTable)
        .values({
          memberId: member.id,
          activityType: member.category,
          isPrimary: true,
          regionId: member.regionId,
          departmentId: member.departmentId,
          arrondissementId: member.arrondissementId,
          village: member.village,
          maillons: (member.categoryData as any)?.maillon || (member.categoryData as any)?.maillons || [],
        })
        .returning();

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

    if (migratedCount > 0) {
      console.log(`✅ Migrated ${migratedCount} legacy members to activity structure.`);
    }

    console.log("🎉 All migrations and seed tasks completed successfully.");
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration/seed execution failed:", error);
    await pool.end();
    process.exit(1);
  }
}

runStandaloneMigrateAndSeed();
