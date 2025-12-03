/**
 * PTA Audit Export Module
 * 
 * Automated PTA-compliant audit log export system for WANCOM ISP.
 * Supports scheduled and on-demand exports of IPDR, RADIUS, KYC,
 * complaints, and network logs in PTA-required formats.
 * 
 * Regulatory compliance:
 * - Pakistan Telecommunication (Re-organization) Act, 1996
 * - CTDISR 2020 & PTA Security Guidelines
 * - PTA Data Retention Requirements
 * 
 * @module AuditExportModule
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

import { AuditExportController } from './controllers/audit-export.controller';
import { AuditExportAdminController } from './controllers/audit-export-admin.controller';
import { AuditExportInternalController } from './controllers/audit-export-internal.controller';

import { AuditExportService } from './services/audit-export.service';
import { AuditExportTemplateService } from './services/template.service';
import { AuditExportGeneratorService } from './services/generator.service';
import { AuditExportSchedulerService } from './services/scheduler.service';
import { AuditExportStorageService } from './services/storage.service';
import { AuditExportAccessLogService } from './services/access-log.service';
import { AuditExportRepository } from './repositories/audit-export.repository';

import { PtaComplianceGuard } from './guards/pta-compliance.guard';
import { AuditExportRoleGuard } from './guards/audit-export-role.guard';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
  ],
  controllers: [
    AuditExportController,
    AuditExportAdminController,
    AuditExportInternalController,
  ],
  providers: [
    // Core services
    AuditExportService,
    AuditExportTemplateService,
    AuditExportGeneratorService,
    AuditExportSchedulerService,
    AuditExportStorageService,
    AuditExportAccessLogService,
    
    // Repository
    AuditExportRepository,
    
    // Guards
    PtaComplianceGuard,
    AuditExportRoleGuard,
  ],
  exports: [
    AuditExportService,
    AuditExportTemplateService,
  ],
})
export class AuditExportModule {}
