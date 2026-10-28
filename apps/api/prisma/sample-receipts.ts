/**
 * Development only: adds a batch of sample submissions (from prisma/sample-receipts/) to
 * review in the CMS, until members can send receipts from LINE (Session 8).
 *
 *   npm run db:sample-receipts      (runs automatically on the first `npm run db:seed`)
 *
 * Each run adds a new batch. Re-sent files are flagged as "same image" on review, on purpose.
 */
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSubmission } from '../src/receipts/receipt-files';
import { ReceiptStorageService } from '../src/receipts/receipt-storage.service';

const FILES = join(__dirname, 'sample-receipts');

/** Member phone → the files they "sent" together. */
const BATCHES: { phone: string; files: string[] }[] = [
  // Like the mockup: one submission of 3 receipts ("ใบที่ 1 จาก 3").
  { phone: '0812341234', files: ['cafe-a-250.jpg', 'restaurant-b-680.jpg', 'retail-c-1200.jpg'] },
  // A clear receipt and a blurry one (reject as unreadable).
  { phone: '0812345678', files: ['bakery-d-390.jpg', 'restaurant-b-blurry.jpg'] },
  // A normal receipt and one from a shop that doesn't take part.
  { phone: '0812349012', files: ['cafe-a-500.jpg', 'service-e-750.jpg'] },
  // The same photo as the first receipt above → "same image" warning.
  { phone: '0812343456', files: ['cafe-a-250.jpg'] },
  // A PDF receipt.
  { phone: '0812342468', files: ['bakery-d-pdf.pdf'] },
  // Northern Community (only users with access to it see this one).
  { phone: '0898765432', files: ['northern-cafe-300.jpg'] },
];

export async function addSampleReceipts(prisma: PrismaClient) {
  const storage = new ReceiptStorageService({
    get: () => process.env.RECEIPT_STORAGE_DIR ?? 'storage/receipts',
  } as never);
  let receipts = 0;
  for (const batch of BATCHES) {
    const member = await prisma.member.findFirst({
      where: { phone: batch.phone, status: 'ACTIVE' },
    });
    if (!member) continue;
    const checked = checkSubmission(
      await Promise.all(batch.files.map((f) => readFile(join(FILES, f)))),
    );
    const paths: string[] = [];
    for (const file of checked) paths.push(await storage.save(file));
    await prisma.submission.create({
      data: {
        memberId: member.id,
        channel: 'SAMPLE',
        receipts: {
          create: checked.map((file, i) => ({
            sequence: i + 1,
            memberId: member.id,
            imagePath: paths[i],
            imageMime: file.mime,
            imageSize: file.size,
            imageSha256: file.sha256,
          })),
        },
      },
    });
    receipts += checked.length;
  }
  return receipts;
}

if (require.main === module) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Sample receipts are for development only.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  addSampleReceipts(prisma)
    .then((n) => console.log(`Added ${n} sample receipts to review.`))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
