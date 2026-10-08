ALTER TABLE "activity_line_items" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "member_activities" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "processed_operations" ADD COLUMN IF NOT EXISTS "payload_hash" text;
ALTER TABLE "processed_operations" DROP CONSTRAINT IF EXISTS "processed_operations_pkey";
ALTER TABLE "processed_operations" DROP CONSTRAINT IF EXISTS "processed_operations_user_id_client_operation_id_pk";
ALTER TABLE "processed_operations" ADD CONSTRAINT "processed_operations_user_id_client_operation_id_pk" PRIMARY KEY("user_id","client_operation_id");
DROP INDEX IF EXISTS "idx_processed_ops_user_client_op";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_processed_ops_user_client_op" ON "processed_operations" USING btree ("user_id","client_operation_id");
