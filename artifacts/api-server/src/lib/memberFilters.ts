import { sql } from "drizzle-orm";
import { membersTable } from "@workspace/db";

// representedByWomanCondition detects if a Personne Morale has at least one representative
// (Représentant 1 or 2) who is a woman (civilite ILIKE "Mme%" or ILIKE "Mlle%")
export const representedByWomanCondition = sql`
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(${membersTable.moraleData}->'representants') AS rep
    WHERE (rep->>'civilite' ILIKE 'Mme%' OR rep->>'civilite' ILIKE 'Mlle%')
  )
`;
