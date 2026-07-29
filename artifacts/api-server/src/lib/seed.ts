import { db, regionsTable, departmentsTable, arrondissementsTable } from "@workspace/db";
import { logger } from "./logger";

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

export async function seedDatabaseIfNeeded(): Promise<void> {
  try {
    const existingRegions = await db.select().from(regionsTable).limit(1);
    if (existingRegions.length > 0) {
      logger.info("Database already seeded with geographic data. Skipping seeding.");
      return;
    }

    logger.info("Seeding database with Cameroon geographic data...");

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

    logger.info("Database successfully seeded with Cameroon geographic data!");
  } catch (error) {
    logger.error({ error }, "Error seeding database");
  }
}
