import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = { message: 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD' };
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Date range (Bangkok calendar days, inclusive) + Location. Missing dates = this month. */
export class RangeQuery {
  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  from?: string;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  to?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

class Paged extends RangeQuery {
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

export class ReceiptsReportQuery extends RangeQuery {
  @IsOptional()
  @IsUUID()
  shopId?: string;

  /** Default APPROVED (as in the mockup); ALL = every status. */
  @IsOptional()
  @IsIn(['ALL', 'PENDING_REVIEW', 'NEEDS_CHECK', 'APPROVED', 'REJECTED'])
  status: 'ALL' | 'PENDING_REVIEW' | 'NEEDS_CHECK' | 'APPROVED' | 'REJECTED' = 'APPROVED';
}

export class MembersReportQuery extends Paged {
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  search?: string;
}

export class LogaReportQuery extends Paged {
  @IsOptional()
  @IsIn(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'])
  transferStatus?: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

  /** Receipt code or member phone. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  search?: string;
}

/** Excel export: the same filters as the screen (members' status is `memberStatus`). */
export class ExportQuery extends RangeQuery {
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsIn(['ALL', 'PENDING_REVIEW', 'NEEDS_CHECK', 'APPROVED', 'REJECTED'])
  status?: ReceiptsReportQuery['status'];

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  memberStatus?: MembersReportQuery['status'];

  @IsOptional()
  @IsIn(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'])
  transferStatus?: LogaReportQuery['transferStatus'];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  search?: string;
}
