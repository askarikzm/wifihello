/**
 * WANCOM ISP - CTDISR-2025 Logging Module
 */

import { Module } from '@nestjs/common';
import { AuditLoggingService } from './audit-logging.service';
import { SiemForwarderService } from './siem-forwarder.service';
import { AlertService } from './alert.service';
import { LoggingController } from './logging.controller';

@Module({
  controllers: [LoggingController],
  providers: [
    AuditLoggingService,
    SiemForwarderService,
    AlertService,
  ],
  exports: [
    AuditLoggingService,
    SiemForwarderService,
    AlertService,
  ],
})
export class LoggingModule {}

export * from './audit-logging.service';
export * from './siem-forwarder.service';
export * from './alert.service';
export * from './types';
