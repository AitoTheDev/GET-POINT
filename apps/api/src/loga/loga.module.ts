import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { HttpLogaClient } from './http-loga.client';
import { LogaService } from './loga.service';
import { LogaClient } from './loga.types';
import { MockLogaClient } from './mock-loga.client';

@Global()
@Module({
  providers: [
    {
      provide: LogaClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        if (config.get('LOGA_MODE', { infer: true }) === 'mock') {
          new Logger('LOGA').log('Using the mock LOGA (LOGA_MODE=mock)');
          return new MockLogaClient(config.get('NODE_ENV', { infer: true }) === 'test' ? 0 : 150);
        }
        return new HttpLogaClient({
          baseUrl: config.get('LOGA_BASE_URL', { infer: true }),
          username: config.get('LOGA_USERNAME', { infer: true })!,
          password: config.get('LOGA_PASSWORD', { infer: true })!,
          deviceId: config.get('LOGA_DEVICE_ID', { infer: true }),
          cardId: config.get('LOGA_CARD_ID', { infer: true })!,
          timeoutMs: config.get('LOGA_TIMEOUT_MS', { infer: true }),
        });
      },
    },
    LogaService,
  ],
  exports: [LogaService],
})
export class LogaModule {}
