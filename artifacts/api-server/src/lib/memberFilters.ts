import { sql } from "drizzle-orm";
import { membersTable } from "@workspace/db";

// Civilité values are selected from this fixed set in the member form.
export const representedByWomanCondition = sql`
  (
    ${membersTable.moraleData}->'representants' @> '[{"civilite":"Mme."}]'::jsonb
    OR ${membersTable.moraleData}->'representants' @> '[{"civilite":"Mlle."}]'::jsonb
  )
`;

export const representedByManCondition = sql`
  ${membersTable.moraleData}->'representants' @> '[{"civilite":"M."}]'::jsonb
`;
