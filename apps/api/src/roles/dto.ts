import { type Menu, MENUS } from '@getpoint/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MenuPermissionDto {
  @IsIn(MENUS)
  menu: Menu;

  @IsBoolean()
  canView: boolean;

  @IsBoolean()
  canManage: boolean;
}

export class CreateRoleDto {
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกชื่อบทบาท' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsArray()
  @ArrayMaxSize(MENUS.length)
  @ValidateNested({ each: true })
  @Type(() => MenuPermissionDto)
  permissions: MenuPermissionDto[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกชื่อบทบาท' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MENUS.length)
  @ValidateNested({ each: true })
  @Type(() => MenuPermissionDto)
  permissions?: MenuPermissionDto[];
}
