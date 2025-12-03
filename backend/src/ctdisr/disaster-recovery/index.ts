/**
 * CTDISR-2025 Disaster Recovery & Business Continuity Module
 * PTA Regulation: Chapter 8 - DR & BCP Management
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DisasterRecoveryService } from './disaster-recovery.service';
import { BackupService } from './backup.service';
import { BcpController, DrpController, BackupController } from './disaster-recovery.controller';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [BcpController, DrpController, BackupController],
  providers: [DisasterRecoveryService, BackupService],
  exports: [DisasterRecoveryService, BackupService],
})
export class DisasterRecoveryModule {}

// Re-export types
export * from './types';
export { DisasterRecoveryService } from './disaster-recovery.service';
export { BackupService } from './backup.service';
export { BcpController, DrpController, BackupController } from './disaster-recovery.controller';
