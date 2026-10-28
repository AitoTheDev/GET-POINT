import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { randomBytes } from 'node:crypto';
import { ReceiptsService } from '../src/receipts/receipts.service';
import { api, createTestApp, login, resetData } from './helpers';

/** A tiny "JPEG": the right magic bytes plus random content (so each is a different image). */
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);

describe('Receipts (e2e)', () => {
  let app: INestApplication;
  let service: ReceiptsService;
  const prisma = new PrismaClient();
  let data: Awaited<ReturnType<typeof resetData>>;
  let admin: string;
  let staff: string;
  let member: { id: string };
  let shopA: { id: string };
  let shopOff: { id: string };
  let shopB: { id: string };

  beforeAll(async () => {
    ({ app } = await createTestApp());
    service = app.get(ReceiptsService);
  });
  beforeEach(async () => {
    data = await resetData(prisma);
    admin = (await login(app, 'admin@test.local')).token;
    staff = (await login(app, 'staff@test.local')).token;
    member = await prisma.member.create({
      data: { communityId: data.community.id, phone: '0812341234', firstName: 'สมชาย' },
    });
    shopA = await prisma.shop.create({ data: { locationId: data.locA.id, name: 'Cafe A' } });
    shopOff = await prisma.shop.create({
      data: { locationId: data.locA.id, name: 'Service E', participating: false },
    });
    shopB = await prisma.shop.create({ data: { locationId: data.locB.id, name: 'Shop B' } });
    // Mall A: 25 baht = 1 point, receipts accepted up to 30 days after their date.
    await prisma.pointRule.create({
      data: {
        locationId: data.locA.id,
        spendAmount: 25,
        points: 1,
        claimDays: 30,
        startDate: new Date('2026-01-01'),
      },
    });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** A submission sent on 2026-10-20 (Bangkok), returning its receipts. */
  async function submit(files: Buffer[], memberId = member.id) {
    const submission = await service.createSubmission(memberId, files, { channel: 'SAMPLE' });
    await prisma.receipt.updateMany({
      where: { submissionId: submission.id },
      data: { submittedAt: new Date('2026-10-20T03:00:00Z') },
    });
    return submission.receipts.sort((a, b) => a.sequence - b.sequence);
  }
  const fields = (overrides: Record<string, unknown> = {}) => ({
    locationId: data.locA.id,
    shopId: shopA.id,
    receiptNo: 'A00125',
    receiptDate: '2026-10-10',
    amount: 680,
    ...overrides,
  });
  const approve = (id: string, body = fields(), token = admin) =>
    api(app, token).post(`/receipts/${id}/approve`).send(body);
  const check = (id: string, f: Record<string, unknown> = fields(), token = admin) =>
    api(app, token)
      .get(`/receipts/${id}/check?${new URLSearchParams(f as Record<string, string>)}`)
      .expect(200)
      .then((r) => r.body);
  const codes = (problems: { code: string }[]) => problems.map((p) => p.code);

  describe('submissions', () => {
    it('stores 1–10 checked files as receipts GP001, GP002… with their position', async () => {
      const receipts = await submit([jpeg(), jpeg(), jpeg()]);
      expect(receipts.map((r) => [r.code, r.sequence])).toEqual([
        ['GP001', 1],
        ['GP002', 2],
        ['GP003', 3],
      ]);
      const detail = await api(app, admin).get(`/receipts/${receipts[1].id}`).expect(200);
      expect(detail.body).toMatchObject({
        status: 'PENDING_REVIEW',
        sequence: 2,
        submission: { count: 3 },
        imageMime: 'image/jpeg',
        member: { phone: '0812341234', name: 'สมชาย' },
      });
      expect(detail.body).not.toHaveProperty('imagePath');
    });

    it('refuses more than 10 files, other file types and suspended members', async () => {
      await expect(
        service.createSubmission(member.id, Array.from({ length: 11 }, jpeg)),
      ).rejects.toThrow('ไม่เกิน 10 ใบ');
      await expect(
        service.createSubmission(member.id, [Buffer.from('GIF89a....')]),
      ).rejects.toThrow('JPG, PNG หรือ PDF');
      await prisma.member.update({ where: { id: member.id }, data: { status: 'SUSPENDED' } });
      await expect(service.createSubmission(member.id, [jpeg()])).rejects.toThrow('ถูกระงับ');
      expect(await prisma.receipt.count()).toBe(0);
    });

    it('serves the file privately, and only to users who can see the receipt', async () => {
      const file = jpeg();
      const [r] = await submit([file]);
      const res = await api(app, admin)
        .get(`/receipts/${r.id}/image`)
        .buffer(true)
        .parse((s, cb) => {
          const chunks: Buffer[] = [];
          s.on('data', (c: Buffer) => chunks.push(c));
          s.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.compare(res.body as Buffer, file)).toBe(0);

      // Placed at Mall B, which Staff (Mall A only) can't access.
      await prisma.receipt.update({ where: { id: r.id }, data: { locationId: data.locB.id } });
      await api(app, staff).get(`/receipts/${r.id}/image`).expect(404);
      await api(app, staff).get(`/receipts/${r.id}`).expect(404);
    });
  });

  describe('live check while reviewing', () => {
    it('finds the rule and points: 680 baht → 27 points', async () => {
      const [r] = await submit([jpeg()]);
      const result = await check(r.id);
      expect(result.rule).toMatchObject({
        label: '25 บาท = 1 แต้ม',
        claimDays: 30,
        level: 'LOCATION',
      });
      expect(result.calculation).toEqual({ points: 27, exact: 27.2, capped: false });
      expect(result.problems).toEqual([]);
    });

    it('flags problems and suggests the matching reject reason', async () => {
      const file = jpeg();
      const [first] = await submit([file]);
      const [again] = await submit([file]);

      let result = await check(again.id);
      expect(result.problems[0]).toMatchObject({
        code: 'SAME_IMAGE',
        blocking: false,
        suggestedReason: 'DUPLICATE',
        receipts: [{ code: first.code }],
      });

      result = await check(first.id, fields({ shopId: shopOff.id }));
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'SHOP_NOT_PARTICIPATING',
            suggestedReason: 'SHOP_NOT_PARTICIPATING',
          }),
        ]),
      );

      // Sent on 20 Oct; 9 Sep is 41 days earlier, over the 30-day limit.
      result = await check(first.id, fields({ receiptDate: '2026-09-09' }));
      // (The same-image warning from above is still there; compare only blocking problems.)
      expect(result.problems.filter((p: { blocking: boolean }) => p.blocking)).toEqual([
        expect.objectContaining({
          code: 'TOO_OLD',
          message: 'ส่งใบเสร็จหลังวันที่บนใบเสร็จ 41 วัน เกินกำหนด 30 วัน',
          suggestedReason: 'TOO_OLD',
        }),
      ]);
      expect(
        codes((await check(first.id, fields({ receiptDate: '2026-09-20' }))).problems),
      ).toEqual(['SAME_IMAGE']);

      expect(
        codes((await check(first.id, fields({ receiptDate: '2026-10-21' }))).problems),
      ).toContain('FUTURE_DATE');
      expect(
        codes(
          (await check(first.id, fields({ locationId: data.locB.id, shopId: shopB.id }))).problems,
        ),
      ).toEqual(['SAME_IMAGE', 'NO_RULE']);
    });

    it('allows any age when the rule has no limit', async () => {
      await prisma.pointRule.updateMany({ data: { claimDays: null } });
      const [r] = await submit([jpeg()]);
      expect((await check(r.id, fields({ receiptDate: '2026-01-02' }))).problems).toEqual([]);
    });
  });

  describe('approve', () => {
    it('approves once, with one point transaction holding a snapshot of the rule', async () => {
      const [r] = await submit([jpeg()]);
      const res = await approve(r.id).expect(200);
      expect(res.body).toMatchObject({
        status: 'APPROVED',
        shop: { id: shopA.id },
        receiptNo: 'A00125',
        receiptDate: '2026-10-10',
        amount: 680,
        reviewedBy: { name: 'Admin' },
        transaction: { points: 27, transferStatus: 'PENDING' },
      });

      const tx = await prisma.pointTransaction.findUniqueOrThrow({ where: { receiptId: r.id } });
      expect(tx).toMatchObject({
        points: 27,
        reference: 'GP001',
        ruleVersion: 1,
        memberId: member.id,
      });
      expect(tx.rule).toMatchObject({
        spendAmount: 25,
        points: 1,
        rounding: 'FLOOR',
        level: 'LOCATION',
      });
      expect(tx.calculation).toEqual({ exact: 27.2, capped: false });

      // Changing the rule later doesn't change what this receipt earned.
      await prisma.pointRule.updateMany({ data: { spendAmount: 10 } });
      expect(
        (await prisma.pointTransaction.findUniqueOrThrow({ where: { receiptId: r.id } })).points,
      ).toBe(27);

      const again = await approve(r.id).expect(409);
      expect(again.body.message).toBe('ใบเสร็จนี้ถูกตรวจสอบไปแล้ว กรุณาโหลดข้อมูลใหม่');
      expect(await prisma.pointTransaction.count()).toBe(1);
    });

    it('lets only one of several simultaneous approvals through', async () => {
      const [r] = await submit([jpeg()]);
      const results = await Promise.all(Array.from({ length: 5 }, () => approve(r.id)));
      expect(results.filter((x) => x.status === 200)).toHaveLength(1);
      expect(results.filter((x) => x.status === 409)).toHaveLength(4);
      expect(await prisma.pointTransaction.count()).toBe(1);
    });

    it('blocks approving the same receipt details twice, even typed differently', async () => {
      const [a, b] = await submit([jpeg(), jpeg()]);
      // Details saved on another open receipt (here via "needs check") → warning only.
      await api(app, admin)
        .post(`/receipts/${a.id}/needs-check`)
        .send({ ...fields(), staffNote: 'เช็คยอด' })
        .expect(200);
      expect(codes((await check(b.id)).problems)).toEqual(['SAME_DETAILS']);
      await approve(a.id).expect(200);

      const result = await check(b.id, fields({ receiptNo: 'a-00125' }));
      expect(result.problems).toEqual([
        expect.objectContaining({
          code: 'DUPLICATE_APPROVED',
          receipts: [expect.objectContaining({ code: a.code })],
        }),
      ]);
      const res = await approve(b.id, fields({ receiptNo: 'a 00125' })).expect(409);
      expect(res.body.message).toBe(`ใบเสร็จนี้ได้รับอนุมัติแล้วใน ${a.code}`);
      // Same shop and date but a different receipt number is a different receipt.
      await approve(b.id, fields({ receiptNo: 'A00126' })).expect(200);
    });

    it('lets the database stop two different receipts with the same details at the same moment', async () => {
      const receipts = await submit([jpeg(), jpeg(), jpeg()]);
      const results = await Promise.all(receipts.map((r) => approve(r.id)));
      expect(results.filter((x) => x.status === 200)).toHaveLength(1);
      expect(await prisma.receipt.count({ where: { status: 'APPROVED' } })).toBe(1);
      expect(await prisma.pointTransaction.count()).toBe(1);
    });

    it('refuses blocked receipts with the reason', async () => {
      const [r] = await submit([jpeg()]);
      let res = await approve(r.id, fields({ shopId: shopOff.id })).expect(409);
      expect(res.body.code).toBe('SHOP_NOT_PARTICIPATING');
      res = await approve(r.id, fields({ receiptDate: '2026-09-01' })).expect(409);
      expect(res.body.code).toBe('TOO_OLD');
      res = await approve(r.id, fields({ locationId: data.locB.id, shopId: shopB.id })).expect(409);
      expect(res.body.code).toBe('NO_RULE');
      await prisma.member.update({ where: { id: member.id }, data: { status: 'SUSPENDED' } });
      res = await approve(r.id).expect(409);
      expect(res.body.code).toBe('MEMBER_SUSPENDED');
      expect((await prisma.receipt.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
        'PENDING_REVIEW',
      );
    });

    it('checks the place: shop in the Location, Location in the member’s Community', async () => {
      const [r] = await submit([jpeg()]);
      await approve(r.id, fields({ shopId: shopB.id })).expect(400);
      const other = await prisma.community.create({
        data: { name: 'Other', locations: { create: { name: 'Mall Z' } } },
        include: { locations: true },
      });
      const res = await approve(r.id, fields({ locationId: other.locations[0].id })).expect(400);
      expect(res.body.message).toBe('สถานที่นี้ไม่ได้อยู่ใน Community ของสมาชิก');
    });

    it('approves a receipt under the rate with 0 points and no transaction', async () => {
      const [r] = await submit([jpeg()]);
      const res = await approve(r.id, fields({ amount: 20 })).expect(200);
      expect(res.body).toMatchObject({ status: 'APPROVED', transaction: null });
      expect(await prisma.pointTransaction.count()).toBe(0);
    });

    it('validates the typed fields', async () => {
      const [r] = await submit([jpeg()]);
      const res = await approve(r.id, fields({ receiptNo: ' ', amount: 0 })).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining(['กรุณากรอกเลขที่ใบเสร็จ', 'ยอดชำระต้องมากกว่า 0']),
      );
    });
  });

  describe('reject and needs-check', () => {
    it('rejects with a reason; members see it except for "Other"', async () => {
      const [a, b] = await submit([jpeg(), jpeg()]);
      const res = await api(app, admin)
        .post(`/receipts/${a.id}/reject`)
        .send({ reason: 'UNREADABLE' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'UNREADABLE',
        rejectLabel: 'รูปภาพไม่ชัดเจน อ่านไม่ได้',
        memberMessage: 'รูปภาพไม่ชัดเจน อ่านไม่ได้',
      });
      await approve(a.id).expect(409);

      await api(app, admin).post(`/receipts/${b.id}/reject`).send({ reason: 'OTHER' }).expect(400);
      const other = await api(app, admin)
        .post(`/receipts/${b.id}/reject`)
        .send({ reason: 'OTHER', note: 'ลูกค้าแจ้งยกเลิกเอง' })
        .expect(200);
      expect(other.body).toMatchObject({
        rejectNote: 'ลูกค้าแจ้งยกเลิกเอง',
        memberMessage: 'ใบเสร็จไม่ผ่านการตรวจสอบ กรุณาติดต่อเจ้าหน้าที่',
      });
      await api(app, admin).post(`/receipts/${b.id}/reject`).send({ reason: 'NOPE' }).expect(400);
    });

    it('marks "needs another check" with a note, keeps typed fields, and can still approve', async () => {
      const [r] = await submit([jpeg()]);
      await api(app, admin).post(`/receipts/${r.id}/needs-check`).send({}).expect(400);
      const res = await api(app, admin)
        .post(`/receipts/${r.id}/needs-check`)
        .send({
          locationId: data.locA.id,
          shopId: shopA.id,
          amount: 680,
          staffNote: 'ยอดไม่ชัด โทรถามร้าน',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'NEEDS_CHECK',
        amount: 680,
        staffNote: 'ยอดไม่ชัด โทรถามร้าน',
      });
      await approve(r.id).expect(200);

      const actions = await prisma.auditLog.findMany({
        where: { entityId: r.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      });
      expect(actions.map((a) => a.action)).toEqual(['receipt.needs_check', 'receipt.approved']);
    });
  });

  describe('added by staff on the review page', () => {
    /** Multipart POST /receipts with a file and form fields. */
    const add = (
      fieldsToSend: Record<string, unknown>,
      file: Buffer | null = jpeg(),
      token = admin,
    ) => {
      let req = api(app, token).post('/receipts');
      for (const [k, v] of Object.entries(fieldsToSend)) {
        if (v !== undefined) req = req.field(k, String(v));
      }
      return file ? req.attach('file', file, 'receipt.jpg') : req;
    };
    const base = () => ({ memberId: member.id, ...fields() });

    it('adds a waiting receipt with whatever was typed, marked as added from the CMS', async () => {
      const res = await add({
        memberId: member.id,
        status: 'PENDING_REVIEW',
        receiptNo: 'X1',
        amount: 100,
      }).expect(201);
      expect(res.body).toMatchObject({
        code: 'GP001',
        status: 'PENDING_REVIEW',
        receiptNo: 'X1',
        amount: 100,
        location: null,
        submission: { count: 1 },
      });
      const submission = await prisma.submission.findFirstOrThrow({ include: { createdBy: true } });
      expect(submission).toMatchObject({
        channel: 'CMS',
        createdBy: { email: 'admin@test.local' },
      });
      const audit = await prisma.auditLog.findFirst({ where: { action: 'receipt.created' } });
      expect(audit?.metadata).toMatchObject({ code: 'GP001', status: 'PENDING_REVIEW' });
    });

    it('approves straight away with points, using the normal approval checks', async () => {
      const res = await add({
        ...base(),
        status: 'APPROVED',
        staffNote: 'ลูกค้านำใบเสร็จมาที่เคาน์เตอร์',
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'APPROVED',
        amount: 680,
        staffNote: 'ลูกค้านำใบเสร็จมาที่เคาน์เตอร์',
        transaction: { points: 27, transferStatus: 'PENDING' },
        reviewedBy: { name: 'Admin' },
      });

      // The same receipt again is refused as a duplicate, and nothing is left behind.
      const dup = await add({ ...base(), receiptNo: 'a-00125', status: 'APPROVED' }).expect(409);
      expect(dup.body.code).toBe('DUPLICATE_APPROVED');
      expect(await prisma.receipt.count()).toBe(1);
      expect(await prisma.submission.count()).toBe(1);
    });

    it('needs all details to approve, and keeps nothing when approval is blocked', async () => {
      const missing = await add({
        memberId: member.id,
        status: 'APPROVED',
        shopId: shopA.id,
        locationId: data.locA.id,
      }).expect(400);
      expect(missing.body.message).toBe(
        'กรอกข้อมูลให้ครบก่อนอนุมัติ: เลขที่ใบเสร็จ, วันที่ใบเสร็จ, ยอดชำระ',
      );

      const blocked = await add({ ...base(), shopId: shopOff.id, status: 'APPROVED' }).expect(409);
      expect(blocked.body.code).toBe('SHOP_NOT_PARTICIPATING');
      expect(await prisma.receipt.count()).toBe(0);
      expect(await prisma.submission.count()).toBe(0);
    });

    it('rejects with a reason and keeps the typed details', async () => {
      await add({ ...base(), status: 'REJECTED' }).expect(400);
      const res = await add({ ...base(), status: 'REJECTED', rejectReason: 'TOO_OLD' }).expect(201);
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'TOO_OLD',
        shop: { id: shopA.id },
        amount: 680,
        memberMessage: 'ใบเสร็จเกินระยะเวลาที่กำหนด',
      });
      await add({ ...base(), status: 'REJECTED', rejectReason: 'OTHER' }).expect(400);
      expect(await prisma.receipt.count()).toBe(1);
    });

    it('puts it in "needs another check" with a note', async () => {
      await add({ ...base(), status: 'NEEDS_CHECK' }).expect(400);
      const res = await add({
        ...base(),
        status: 'NEEDS_CHECK',
        staffNote: 'รอยืนยันยอดกับร้าน',
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'NEEDS_CHECK',
        staffNote: 'รอยืนยันยอดกับร้าน',
        amount: 680,
      });
    });

    it('needs a valid file, a member in scope and the manage permission', async () => {
      const noFile = await add({ memberId: member.id, status: 'PENDING_REVIEW' }, null).expect(400);
      expect(noFile.body.message).toBe('กรุณาแนบรูปหรือไฟล์ใบเสร็จ');
      const bad = await add(
        { memberId: member.id, status: 'PENDING_REVIEW' },
        Buffer.from('not an image'),
      ).expect(400);
      expect(bad.body.message).toContain('JPG, PNG หรือ PDF');
      const big = Buffer.alloc(10 * 1024 * 1024 + 1);
      jpeg().copy(big);
      const tooBig = await add({ memberId: member.id, status: 'PENDING_REVIEW' }, big).expect(413);
      expect(tooBig.body.message).toBe('ไฟล์มีขนาดเกิน 10 MB');
      await add({ memberId: member.id, status: 'DONE' }).expect(400);

      const outsider = await prisma.member.create({
        data: {
          communityId: (await prisma.community.create({ data: { name: 'Other' } })).id,
          phone: '0899990000',
          firstName: 'X',
        },
      });
      await add({ memberId: outsider.id, status: 'PENDING_REVIEW' }, jpeg(), staff).expect(404);

      const manager = (await login(app, 'manager@test.local')).token;
      await add({ memberId: member.id, status: 'PENDING_REVIEW' }, jpeg(), manager).expect(403);
      expect(await prisma.receipt.count()).toBe(0);
    });

    it('finds members to pick by name, code or phone, within scope', async () => {
      await prisma.member.create({
        data: {
          communityId: data.community.id,
          phone: '0899998888',
          firstName: 'ระงับ',
          status: 'SUSPENDED',
        },
      });
      const byPhone = await api(app, staff).get('/receipts/members?search=081-234').expect(200);
      expect(byPhone.body).toEqual([
        expect.objectContaining({ id: member.id, firstName: 'สมชาย' }),
      ]);
      const all = await api(app, staff).get('/receipts/members').expect(200);
      expect(all.body.map((m: { firstName: string }) => m.firstName)).toEqual(['สมชาย']);
    });
  });

  describe('lists, scope and permissions', () => {
    it('counts per status and lists the queue oldest first, searchable', async () => {
      const [a, b] = await submit([jpeg(), jpeg()]);
      await prisma.receipt.update({
        where: { id: b.id },
        data: { submittedAt: new Date('2026-10-19T00:00:00Z') },
      });
      await approve(a.id).expect(200);
      const [c] = await submit([jpeg()]);
      await api(app, admin)
        .post(`/receipts/${c.id}/reject`)
        .send({ reason: 'UNREADABLE' })
        .expect(200);

      const summary = await api(app, admin).get('/receipts/summary').expect(200);
      expect(summary.body).toEqual({
        PENDING_REVIEW: 1,
        NEEDS_CHECK: 0,
        APPROVED: 1,
        REJECTED: 1,
        total: 3,
      });

      const queue = await api(app, admin).get('/receipts?status=PENDING_REVIEW').expect(200);
      expect(queue.body.items.map((r: { code: string }) => r.code)).toEqual([b.code]);
      const history = await api(app, admin).get('/receipts?sort=amount&order=desc').expect(200);
      expect(history.body.items[0].code).toBe(a.code);

      const byCode = await api(app, admin).get('/receipts?search=%23gp002').expect(200);
      expect(byCode.body.items.map((r: { code: string }) => r.code)).toEqual(['GP002']);
      const byPhone = await api(app, admin).get('/receipts?search=081-234').expect(200);
      expect(byPhone.body.total).toBe(3);
      const byNo = await api(app, admin).get('/receipts?search=a001').expect(200);
      expect(byNo.body.items.map((r: { code: string }) => r.code)).toEqual([a.code]);
    });

    it('shows Location staff their Location’s receipts and unplaced ones from their Community', async () => {
      const [unplaced, atA, atB] = await submit([jpeg(), jpeg(), jpeg()]);
      await prisma.receipt.update({ where: { id: atA.id }, data: { locationId: data.locA.id } });
      await prisma.receipt.update({ where: { id: atB.id }, data: { locationId: data.locB.id } });
      const outsider = await prisma.community.create({ data: { name: 'Other' } });
      const otherMember = await prisma.member.create({
        data: { communityId: outsider.id, phone: '0899990000', firstName: 'X' },
      });
      await submit([jpeg()], otherMember.id);

      const list = await api(app, staff).get('/receipts').expect(200);
      expect(list.body.items.map((r: { code: string }) => r.code).sort()).toEqual(
        [unplaced.code, atA.code].sort(),
      );
      expect((await api(app, staff).get('/receipts/summary').expect(200)).body.total).toBe(2);

      // Staff can't place a receipt at a Location outside their access.
      await approve(
        unplaced.id,
        fields({ locationId: data.locB.id, shopId: shopB.id }),
        staff,
      ).expect(404);
      await approve(unplaced.id, fields(), staff).expect(200);
    });

    it('requires receipt permissions; History alone can look but not decide', async () => {
      const [r] = await submit([jpeg()]);
      const manager = (await login(app, 'manager@test.local')).token;
      await api(app, manager).get('/receipts').expect(403);

      const role = await prisma.role.create({
        data: {
          key: 'HISTORY',
          name: 'History',
          permissions: { create: [{ menu: 'RECEIPT_HISTORY', canView: true, canManage: false }] },
        },
      });
      await prisma.user.update({ where: { id: data.staff.id }, data: { roleId: role.id } });
      const viewer = (await login(app, 'staff@test.local')).token;
      await api(app, viewer).get('/receipts').expect(200);
      await api(app, viewer).get(`/receipts/${r.id}/image`).expect(200);
      await api(app, viewer).get('/receipts/export').expect(200);
      await api(app, viewer).get(`/receipts/${r.id}/check`).expect(403);
      await approve(r.id, fields(), viewer).expect(403);
      await api(app, viewer)
        .post(`/receipts/${r.id}/reject`)
        .send({ reason: 'UNREADABLE' })
        .expect(403);
    });

    it('exports the history to Excel', async () => {
      const [a, b] = await submit([jpeg(), jpeg()]);
      await approve(a.id).expect(200);
      await api(app, admin)
        .post(`/receipts/${b.id}/reject`)
        .send({ reason: 'TOO_OLD' })
        .expect(200);

      const res = await api(app, admin)
        .get('/receipts/export')
        .buffer(true)
        .parse((s, cb) => {
          const chunks: Buffer[] = [];
          s.on('data', (c: Buffer) => chunks.push(c));
          s.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const sheet = workbook.getWorksheet('ใบเสร็จ')!;
      const rows = sheet.getSheetValues().slice(2) as unknown[][];
      const byCode = Object.fromEntries(rows.map((row) => [row[1], row]));
      expect(byCode[a.code]).toEqual(
        expect.arrayContaining([
          '081-234-1234',
          'Cafe A',
          'A00125',
          680,
          27,
          'อนุมัติแล้ว',
          'รอส่ง',
        ]),
      );
      expect(byCode[b.code]).toEqual(
        expect.arrayContaining(['ไม่อนุมัติ', 'ใบเสร็จเกินระยะเวลาที่กำหนด']),
      );
    });
  });
});
