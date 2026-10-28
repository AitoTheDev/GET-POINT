-- DropIndex
DROP INDEX "point_transactions_transfer_status_idx";

-- AlterTable
ALTER TABLE "point_transactions" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_attempt_at" TIMESTAMP(3),
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "next_attempt_at" TIMESTAMP(3),
ADD COLUMN     "points_after" INTEGER,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "point_transfer_attempts" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "result" "TransferStatus" NOT NULL,
    "error" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "triggered_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transfer_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "point_transfer_attempts_transaction_id_idx" ON "point_transfer_attempts"("transaction_id");

-- CreateIndex
CREATE INDEX "point_transactions_transfer_status_next_attempt_at_idx" ON "point_transactions"("transfer_status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "point_transfer_attempts" ADD CONSTRAINT "point_transfer_attempts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "point_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transfer_attempts" ADD CONSTRAINT "point_transfer_attempts_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Points approved before this release are waiting to be sent: due now.
UPDATE "point_transactions" SET "next_attempt_at" = CURRENT_TIMESTAMP WHERE "transfer_status" = 'PENDING';
