-- Phase 7 corrective: align deliveries.updated_at with Prisma's @updatedAt
-- convention (client-managed timestamp, no DB default) to match every other
-- model in the schema. No data is read, changed, or dropped.
ALTER TABLE "deliveries" ALTER COLUMN "updated_at" DROP DEFAULT;
