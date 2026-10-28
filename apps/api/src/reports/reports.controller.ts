import { Menu } from '@getpoint/shared';
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestUser } from '../auth/auth-user';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { ShopsQuery } from '../receipts/dto';
import { ReceiptsService } from '../receipts/receipts.service';
import {
  ExportQuery,
  LogaReportQuery,
  MembersReportQuery,
  RangeQuery,
  ReceiptsReportQuery,
} from './dto';
import { ReportsService, type ReportKind } from './reports.service';

const ANY = [Menu.DASHBOARD, Menu.REPORTS];

/** Dashboard (DASHBOARD view) and รายงาน (REPORTS view); everything within the user's scope. */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly receipts: ReceiptsService,
  ) {}

  /** Location filter options. */
  @RequirePermission(ANY, 'view')
  @Get('locations')
  locations(@CurrentUser() user: RequestUser) {
    return this.receipts.locations(user);
  }

  @RequirePermission(Menu.REPORTS, 'view')
  @Get('shops')
  shops(@Query() query: ShopsQuery, @CurrentUser() user: RequestUser) {
    return this.receipts.shops(query.locationId, user);
  }

  @RequirePermission(Menu.DASHBOARD, 'view')
  @Get('dashboard')
  dashboard(@Query() query: RangeQuery, @CurrentUser() user: RequestUser) {
    return this.reports.dashboard(query, user);
  }

  @RequirePermission(Menu.DASHBOARD, 'view')
  @Get('dashboard/export')
  exportDashboard(
    @Query() query: RangeQuery,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return this.send('dashboard', query, user, res);
  }

  @RequirePermission(Menu.REPORTS, 'view')
  @Get('receipts')
  receiptsReport(@Query() query: ReceiptsReportQuery, @CurrentUser() user: RequestUser) {
    return this.reports.receipts(query, user);
  }

  @RequirePermission(Menu.REPORTS, 'view')
  @Get('members')
  members(@Query() query: MembersReportQuery, @CurrentUser() user: RequestUser) {
    return this.reports.members(query, user);
  }

  @RequirePermission(Menu.REPORTS, 'view')
  @Get('loga')
  loga(@Query() query: LogaReportQuery, @CurrentUser() user: RequestUser) {
    return this.reports.loga(query, user);
  }

  @RequirePermission(Menu.REPORTS, 'view')
  @Get('receipts/export')
  exportReceipts(@Query() q: ExportQuery, @CurrentUser() u: RequestUser, @Res() res: Response) {
    return this.send('receipts', q, u, res);
  }

  @RequirePermission(Menu.REPORTS, 'view')
  @Get('members/export')
  exportMembers(@Query() q: ExportQuery, @CurrentUser() u: RequestUser, @Res() res: Response) {
    return this.send('members', q, u, res);
  }

  @RequirePermission(Menu.REPORTS, 'view')
  @Get('loga/export')
  exportLoga(@Query() q: ExportQuery, @CurrentUser() u: RequestUser, @Res() res: Response) {
    return this.send('loga', q, u, res);
  }

  private async send(report: ReportKind, q: ExportQuery, user: RequestUser, res: Response) {
    const file = await this.reports.exportXlsx(report, q, user);
    const date = new Date().toISOString().slice(0, 10);
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report-${report}-${date}.xlsx"`,
      })
      .send(file);
  }
}
