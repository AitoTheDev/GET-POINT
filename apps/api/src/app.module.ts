import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { LogaModule } from './loga/loga.module';
import { MailModule } from './mail/mail.module';
import { MembersModule } from './members/members.module';
import { OrgModule } from './org/org.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PointRulesModule } from './point-rules/point-rules.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { TransfersModule } from './transfers/transfers.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // General per-IP limit; auth endpoints set stricter limits with @Throttle.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      // Automated tests log in many times from one IP (rate-limit.e2e-spec turns it back on).
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.TEST_RATE_LIMIT !== '1',
    }),
    PrismaModule,
    AuditModule,
    MailModule,
    AuthModule,
    RolesModule,
    UsersModule,
    OrgModule,
    LogaModule,
    MembersModule,
    PointRulesModule,
    ReceiptsModule,
    SettingsModule,
    TransfersModule,
    ReportsModule,
    ActivityLogModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
