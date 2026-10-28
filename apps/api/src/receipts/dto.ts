import { REJECT_REASONS, type RejectReason } from '@getpoint/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const STATUSES = ['PENDING_REVIEW', 'NEEDS_CHECK', 'APPROVED', 'REJECTED'] as const;
type Status = (typeof STATUSES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = { message: 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD' };

/** What staff read off the receipt image. */
export class ReceiptFieldsDto {
  @IsUUID('all', { message: 'กรุณาเลือกสถานที่' })
  locationId: string;

  @IsUUID('all', { message: 'กรุณาเลือกร้านค้า' })
  shopId: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกเลขที่ใบเสร็จ' })
  @MaxLength(60)
  receiptNo: string;

  @Matches(DATE, DATE_MESSAGE)
  receiptDate: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'ยอดชำระต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง' })
  @Min(0.01, { message: 'ยอดชำระต้องมากกว่า 0' })
  @Max(10_000_000)
  amount: number;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  staffNote?: string | null;
}

/** Same fields, all optional: "check while typing" and "needs another check". */
export class PartialFieldsDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  receiptNo?: string;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  receiptDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'ยอดชำระต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง' })
  @Min(0)
  @Max(10_000_000)
  amount?: number;
}

export class NeedsCheckDto extends PartialFieldsDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'กรุณาระบุสิ่งที่ต้องตรวจเพิ่ม' })
  @MaxLength(500)
  staffNote: string;
}

/** Reject; anything already read off the receipt is kept too (for history and reports). */
export class RejectDto extends PartialFieldsDto {
  @IsIn(REJECT_REASONS, { message: 'กรุณาเลือกเหตุผล' })
  reason: RejectReason;

  /** Required for OTHER; internal only. */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/**
 * A receipt added by staff on the review page (multipart form: `file` + these fields).
 * The status is chosen up front; each status needs what its normal action needs.
 */
export class CreateReceiptDto extends PartialFieldsDto {
  @IsUUID('all', { message: 'กรุณาเลือกสมาชิก' })
  memberId: string;

  @IsIn(STATUSES, { message: 'กรุณาเลือกสถานะ' })
  status: Status;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  staffNote?: string | null;

  @IsOptional()
  @IsIn(REJECT_REASONS, { message: 'กรุณาเลือกเหตุผล' })
  rejectReason?: RejectReason;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  rejectNote?: string | null;
}

export class MemberSearchQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  search?: string;
}

const SORTS = ['submittedAt', 'amount', 'points', 'status'] as const;

export class ListReceiptsQuery {
  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;

  /** Receipt code (GP001), phone or receipt number. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  search?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  /** Submitted on or after this Bangkok day. */
  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  submittedFrom?: string;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  submittedTo?: string;

  @IsOptional()
  @IsIn(SORTS)
  sort?: (typeof SORTS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ShopsQuery {
  @IsUUID()
  locationId: string;
}
