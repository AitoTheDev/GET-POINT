-- AlterEnum
ALTER TYPE "SubmissionChannel" ADD VALUE 'CMS';

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "created_by_id" UUID;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
