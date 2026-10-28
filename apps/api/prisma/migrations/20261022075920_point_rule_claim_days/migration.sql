-- AlterTable
ALTER TABLE "point_rule_versions" ADD COLUMN     "claim_days" INTEGER;

-- AlterTable
ALTER TABLE "point_rules" ADD COLUMN     "claim_days" INTEGER DEFAULT 30;

-- Existing versions were saved before the limit existed; record the same default the rules got.
UPDATE "point_rule_versions" SET "claim_days" = 30;

ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_claim_days"
  CHECK ("claim_days" IS NULL OR "claim_days" >= 0);
