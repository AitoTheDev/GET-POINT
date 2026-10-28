-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('FLOOR', 'ROUND', 'CEIL');

-- CreateTable
CREATE TABLE "point_rules" (
    "id" UUID NOT NULL,
    "community_id" UUID,
    "location_id" UUID,
    "shop_id" UUID,
    "spend_amount" DECIMAL(12,2) NOT NULL,
    "points" INTEGER NOT NULL,
    "rounding" "RoundingMode" NOT NULL DEFAULT 'FLOOR',
    "max_points" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_rule_versions" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "spend_amount" DECIMAL(12,2) NOT NULL,
    "points" INTEGER NOT NULL,
    "rounding" "RoundingMode" NOT NULL,
    "max_points" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "ActiveStatus" NOT NULL,
    "changed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "point_rules_community_id_idx" ON "point_rules"("community_id");

-- CreateIndex
CREATE INDEX "point_rules_location_id_idx" ON "point_rules"("location_id");

-- CreateIndex
CREATE INDEX "point_rules_shop_id_idx" ON "point_rules"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_rule_versions_rule_id_version_key" ON "point_rule_versions"("rule_id", "version");

-- AddForeignKey
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_rule_versions" ADD CONSTRAINT "point_rule_versions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "point_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_rule_versions" ADD CONSTRAINT "point_rule_versions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A rule belongs to exactly one place: a Community, a Location or a Shop.
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_one_target"
  CHECK (num_nonnulls("community_id", "location_id", "shop_id") = 1);

-- Sensible values, also enforced by the API.
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_values"
  CHECK ("spend_amount" > 0 AND "points" > 0 AND ("max_points" IS NULL OR "max_points" > 0)
         AND ("end_date" IS NULL OR "end_date" >= "start_date"));
