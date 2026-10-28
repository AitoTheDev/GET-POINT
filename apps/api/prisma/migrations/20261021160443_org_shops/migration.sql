-- Auto-generated codes: PREFIX + number padded to at least 3 digits (COM001, LOC012, S1234).
CREATE FUNCTION gp_next_code(prefix text, seq regclass) RETURNS text
  LANGUAGE sql VOLATILE AS $$
    SELECT prefix || lpad(n::text, greatest(3, length(n::text)), '0')
    FROM (SELECT nextval(seq) AS n) AS next
  $$;

CREATE SEQUENCE community_code_seq;
CREATE SEQUENCE location_code_seq;
CREATE SEQUENCE shop_code_seq;

-- Continue numbering after codes that already exist (e.g. seeded COM001 / LOC001-LOC003).
SELECT setval('community_code_seq', GREATEST(1, COALESCE((SELECT max(substring(code FROM '^COM(\d+)$')::int) FROM communities), 0)), (SELECT count(*) > 0 FROM communities WHERE code ~ '^COM\d+$'));
SELECT setval('location_code_seq', GREATEST(1, COALESCE((SELECT max(substring(code FROM '^LOC(\d+)$')::int) FROM locations), 0)), (SELECT count(*) > 0 FROM locations WHERE code ~ '^LOC\d+$'));

-- AlterTable
ALTER TABLE "communities" ALTER COLUMN "code" SET DEFAULT gp_next_code('COM'::text, 'community_code_seq'::regclass);

-- AlterTable
ALTER TABLE "locations" ALTER COLUMN "code" SET DEFAULT gp_next_code('LOC'::text, 'location_code_seq'::regclass);

-- CreateTable
CREATE TABLE "shop_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "category_id" UUID,
    "code" TEXT NOT NULL DEFAULT gp_next_code('S'::text, 'shop_code_seq'::regclass),
    "name" TEXT NOT NULL,
    "receipt_name" TEXT,
    "participating" BOOLEAN NOT NULL DEFAULT true,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_categories_name_key" ON "shop_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shops_code_key" ON "shops"("code");

-- CreateIndex
CREATE INDEX "shops_location_id_idx" ON "shops"("location_id");

-- CreateIndex
CREATE INDEX "shops_category_id_idx" ON "shops"("category_id");

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "shop_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
