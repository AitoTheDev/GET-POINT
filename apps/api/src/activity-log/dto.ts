import { ActivityGroupLabel } from '@getpoint/shared';
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

export class ActivityLogQuery {
  /** Action prefix, e.g. "receipt". */
  @IsOptional()
  @IsIn(Object.keys(ActivityGroupLabel))
  group?: string;

  /** Only used when the user may see everyone's activity. */
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  from?: string;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  to?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  search?: string;

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
