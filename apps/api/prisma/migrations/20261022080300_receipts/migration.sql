-- Receipt codes: GP001, GP002, ...
CREATE SEQUENCE receipt_code_seq;

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING_REVIEW', 'NEEDS_CHECK', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RejectReason" AS ENUM ('UNREADABLE', 'DUPLICATE', 'SHOP_NOT_PARTICIPATING', 'NOT_A_RECEIPT', 'INCOMPLETE', 'TOO_OLD', 'SHOP_NOT_FOUND', 'ALTERED', 'OTHER');

-- CreateEnum
CREATE TYPE "SubmissionChannel" AS ENUM ('LIFF', 'SAMPLE');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "channel" "SubmissionChannel" NOT NULL DEFAULT 'LIFF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL DEFAULT gp_next_code('GP'::text, 'receipt_code_seq'::regclass),
    "submission_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "member_id" UUID NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "image_path" TEXT NOT NULL,
    "image_mime" TEXT NOT NULL,
    "image_size" INTEGER NOT NULL,
    "image_sha256" TEXT NOT NULL,
    "location_id" UUID,
    "shop_id" UUID,
    "receipt_no" TEXT,
    "receipt_date" DATE,
    "amount" DECIMAL(12,2),
    "fingerprint" TEXT,
    "staff_note" TEXT,
    "reject_reason" "RejectReason",
    "reject_note" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "rule" JSONB NOT NULL,
    "calculation" JSONB NOT NULL,
    "reference" TEXT NOT NULL,
    "transfer_status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submissions_member_id_idx" ON "submissions"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_code_key" ON "receipts"("code");

-- CreateIndex
CREATE INDEX "receipts_status_submitted_at_idx" ON "receipts"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "receipts_submission_id_idx" ON "receipts"("submission_id");

-- CreateIndex
CREATE INDEX "receipts_member_id_idx" ON "receipts"("member_id");

-- CreateIndex
CREATE INDEX "receipts_location_id_idx" ON "receipts"("location_id");

-- CreateIndex
CREATE INDEX "receipts_shop_id_idx" ON "receipts"("shop_id");

-- CreateIndex
CREATE INDEX "receipts_image_sha256_idx" ON "receipts"("image_sha256");

-- CreateIndex
CREATE INDEX "receipts_fingerprint_idx" ON "receipts"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_receipt_id_key" ON "point_transactions"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_reference_key" ON "point_transactions"("reference");

-- CreateIndex
CREATE INDEX "point_transactions_member_id_idx" ON "point_transactions"("member_id");

-- CreateIndex
CREATE INDEX "point_transactions_transfer_status_idx" ON "point_transactions"("transfer_status");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "point_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER SEQUENCE receipt_code_seq OWNED BY receipts.code;

-- The same receipt (shop + receipt no. + date + amount) can be approved only once.
CREATE UNIQUE INDEX "receipts_fingerprint_approved_key" ON "receipts"("fingerprint")
  WHERE "status" = 'APPROVED';

-- Upload limits (10 files per submission, 10 MB each) and review rules.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_values" CHECK (
  "sequence" BETWEEN 1 AND 10
  AND "image_size" BETWEEN 1 AND 10485760
  AND ("amount" IS NULL OR "amount" >= 0)
  AND ("status" <> 'APPROVED' OR ("shop_id" IS NOT NULL AND "receipt_date" IS NOT NULL
                                 AND "amount" IS NOT NULL AND "fingerprint" IS NOT NULL))
  AND ("status" <> 'REJECTED' OR "reject_reason" IS NOT NULL)
  AND ("reject_reason" IS DISTINCT FROM 'OTHER' OR length(trim("reject_note")) > 0)
);

ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_values"
  CHECK ("points" > 0 AND "amount" >= 0);
