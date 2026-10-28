-- Two ACTIVE rules at the same place (Community, Location or Shop) may not cover the same day.
-- The API checks this first to give a clear message; this constraint guarantees it even when
-- two saves happen at the same moment.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_no_overlap"
  EXCLUDE USING gist (
    (COALESCE("community_id", "location_id", "shop_id")) WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("status" = 'ACTIVE');
