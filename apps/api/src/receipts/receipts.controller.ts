import { Menu, RECEIPT_MAX_FILE_BYTES } from '@getpoint/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import {
  CreateReceiptDto,
  ListReceiptsQuery,
  MemberSearchQuery,
  NeedsCheckDto,
  PartialFieldsDto,
  ReceiptFieldsDto,
  RejectDto,
  ShopsQuery,
} from './dto';
import { ReceiptsService } from './receipts.service';

/** Either receipt menu lets you look at receipts; deciding needs Review "manage". */
const VIEW = [Menu.RECEIPT_REVIEW, Menu.RECEIPT_HISTORY];

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @RequirePermission(VIEW, 'view')
  @Get('summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.receipts.summary(user);
  }

  @RequirePermission(VIEW, 'view')
  @Get('locations')
  locations(@CurrentUser() user: RequestUser) {
    return this.receipts.locations(user);
  }

  @RequirePermission(VIEW, 'view')
  @Get('shops')
  shops(@Query() query: ShopsQuery, @CurrentUser() user: RequestUser) {
    return this.receipts.shops(query.locationId, user);
  }

  /** Reject reasons (wording from Settings) and upload limits, for the review screens. */
  @RequirePermission(VIEW, 'view')
  @Get('config')
  config() {
    return this.receipts.config();
  }

  /** Members to choose from when adding a receipt by hand. */
  @RequirePermission(Menu.RECEIPT_REVIEW, 'manage')
  @Get('members')
  members(@Query() query: MemberSearchQuery, @CurrentUser() user: RequestUser) {
    return this.receipts.memberOptions(query.search, user);
  }

  /** Staff add a receipt themselves: multipart form with `file` and the receipt fields. */
  @RequirePermission(Menu.RECEIPT_REVIEW, 'manage')
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: RECEIPT_MAX_FILE_BYTES, files: 1 } }),
  )
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateReceiptDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.receipts.createByStaff(file?.buffer, dto, user);
  }

  @RequirePermission(Menu.RECEIPT_HISTORY, 'view')
  @Get('export')
  async export(
    @Query() query: ListReceiptsQuery,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const file = await this.receipts.exportXlsx(query, user);
    const date = new Date().toISOString().slice(0, 10);
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="receipts-${date}.xlsx"`,
      })
      .send(file);
  }

  @RequirePermission(VIEW, 'view')
  @Get()
  list(@Query() query: ListReceiptsQuery, @CurrentUser() user: RequestUser) {
    return this.receipts.list(query, user);
  }

  @RequirePermission(VIEW, 'view')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.receipts.get(id, user);
  }

  /** The receipt image/PDF. Private: never cached, never shared by URL. */
  @RequirePermission(VIEW, 'view')
  @Get(':id/image')
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const file = await this.receipts.image(id, user);
    res.set({
      'Content-Type': file.mime,
      'Content-Length': String(file.size),
      'Content-Disposition': `inline; filename="${file.code}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    file.stream.pipe(res);
  }

  /** Attempts at sending this receipt's points to LOGA. */
  @RequirePermission(VIEW, 'view')
  @Get(':id/transfer')
  transfer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.receipts.transferAttempts(id, user);
  }

  /** Send the points again now (after a failure or an unknown outcome). */
  @RequirePermission(Menu.RECEIPT_REVIEW, 'manage')
  @Post(':id/transfer/retry')
  @HttpCode(200)
  retryTransfer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.receipts.retryTransfer(id, user);
  }

  /** Live check while staff type: rule, points, duplicates, problems. */
  @RequirePermission(Menu.RECEIPT_REVIEW, 'view')
  @Get(':id/check')
  check(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() fields: PartialFieldsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.receipts.check(id, fields, user);
  }

  @RequirePermission(Menu.RECEIPT_REVIEW, 'manage')
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiptFieldsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.receipts.approve(id, dto, user);
  }

  @RequirePermission(Menu.RECEIPT_REVIEW, 'manage')
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.receipts.reject(id, dto, user);
  }

  @RequirePermission(Menu.RECEIPT_REVIEW, 'manage')
  @Post(':id/needs-check')
  @HttpCode(200)
  needsCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NeedsCheckDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.receipts.needsCheck(id, dto, user);
  }
}
