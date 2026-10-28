import { ROUNDING_MODES, type PointRuleLevel, type RoundingMode } from '@getpoint/shared';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const LEVELS = ['COMMUNITY', 'LOCATION', 'SHOP'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
type Status = (typeof STATUSES)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = { message: 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD' };
const MONEY = { maxDecimalPlaces: 2 };

export class CreatePointRuleDto {
  @IsIn(LEVELS)
  level: PointRuleLevel;

  /** Community, Location or Shop ID, according to `level`. */
  @IsUUID('all', { message: 'กรุณาเลือกสถานที่หรือร้านค้า' })
  targetId: string;

  @IsNumber(MONEY, { message: 'ยอดใช้จ่ายต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง' })
  @Min(0.01, { message: 'ยอดใช้จ่ายต้องมากกว่า 0' })
  @Max(1_000_000)
  spendAmount: number;

  @IsInt({ message: 'จำนวนแต้มต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'จำนวนแต้มต้องอย่างน้อย 1' })
  @Max(100_000)
  points: number;

  @IsIn(ROUNDING_MODES)
  rounding: RoundingMode;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt({ message: 'แต้มสูงสุดต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'แต้มสูงสุดต้องอย่างน้อย 1' })
  @Max(10_000_000)
  maxPoints?: number | null;

  /** Days after the receipt date a receipt may still be sent; null = no limit. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt({ message: 'จำนวนวันต้องเป็นจำนวนเต็ม' })
  @Min(0, { message: 'จำนวนวันต้องไม่ติดลบ' })
  @Max(3650)
  claimDays?: number | null;

  @Matches(DATE, DATE_MESSAGE)
  startDate: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE, DATE_MESSAGE)
  endDate?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

/** Where a rule applies can't change; create a new rule for another place. */
export class UpdatePointRuleDto {
  @IsOptional()
  @IsNumber(MONEY, { message: 'ยอดใช้จ่ายต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง' })
  @Min(0.01, { message: 'ยอดใช้จ่ายต้องมากกว่า 0' })
  @Max(1_000_000)
  spendAmount?: number;

  @IsOptional()
  @IsInt({ message: 'จำนวนแต้มต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'จำนวนแต้มต้องอย่างน้อย 1' })
  @Max(100_000)
  points?: number;

  @IsOptional()
  @IsIn(ROUNDING_MODES)
  rounding?: RoundingMode;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt({ message: 'แต้มสูงสุดต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'แต้มสูงสุดต้องอย่างน้อย 1' })
  @Max(10_000_000)
  maxPoints?: number | null;

  /** Days after the receipt date a receipt may still be sent; null = no limit. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt({ message: 'จำนวนวันต้องเป็นจำนวนเต็ม' })
  @Min(0, { message: 'จำนวนวันต้องไม่ติดลบ' })
  @Max(3650)
  claimDays?: number | null;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  startDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE, DATE_MESSAGE)
  endDate?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

export class ListPointRulesQuery {
  @IsOptional()
  @IsUUID()
  communityId?: string;

  /** Rules that affect this Location: its own, its shops' and its Community's. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

export class ShopsQuery {
  @IsUUID()
  locationId: string;
}

/** "Which rule applies to this shop on this date, and how many points?" */
export class ResolveQuery {
  @IsUUID('all', { message: 'กรุณาเลือกร้านค้า' })
  shopId: string;

  @Matches(DATE, DATE_MESSAGE)
  date: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  @Max(100_000_000)
  amount?: number;
}
