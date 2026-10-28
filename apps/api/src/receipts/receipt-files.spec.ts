import { checkFile, checkSubmission, detectType, ReceiptFileError } from './receipt-files';

const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const pdf = Buffer.from('%PDF-1.7\n...');

describe('receipt files', () => {
  it('detects JPG, PNG and PDF from their bytes', () => {
    expect(detectType(jpg)?.mime).toBe('image/jpeg');
    expect(detectType(png)?.mime).toBe('image/png');
    expect(detectType(pdf)?.mime).toBe('application/pdf');
    expect(detectType(Buffer.from('GIF89a'))).toBeNull();
  });

  it('rejects other types even if named like an image', () => {
    expect(() => checkFile(Buffer.from('<svg/>'), 'photo.jpg')).toThrow(
      'photo.jpg ต้องเป็นไฟล์ JPG, PNG หรือ PDF',
    );
  });

  it('enforces 10 MB per file', () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    jpg.copy(big);
    expect(() => checkFile(big)).toThrow('มีขนาดเกิน 10 MB');
    const limit = Buffer.alloc(10 * 1024 * 1024);
    jpg.copy(limit);
    expect(checkFile(limit).size).toBe(10 * 1024 * 1024);
    expect(() => checkFile(Buffer.alloc(0))).toThrow('ว่างเปล่า');
  });

  it('hashes files so identical images can be found', () => {
    expect(checkFile(jpg).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(checkFile(jpg).sha256).toBe(checkFile(Buffer.from(jpg)).sha256);
    expect(checkFile(jpg).sha256).not.toBe(checkFile(png).sha256);
  });

  it('allows 1 to 10 files per submission', () => {
    expect(() => checkSubmission([])).toThrow(ReceiptFileError);
    expect(checkSubmission(Array(10).fill(jpg))).toHaveLength(10);
    expect(() => checkSubmission(Array(11).fill(jpg))).toThrow('ไม่เกิน 10 ใบ');
    expect(() => checkSubmission([jpg, Buffer.from('nope')])).toThrow('ใบเสร็จที่ 2');
  });
});
