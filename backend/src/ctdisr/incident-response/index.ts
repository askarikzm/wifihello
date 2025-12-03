/**
 * CTDISR-2025 Incident Response & Forensics Module
 * PTA Regulation: Chapter 7 - Incident Management & Digital Forensics
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IncidentResponseService } from './incident-response.service';
import { ForensicsService } from './forensics.service';
import { IncidentResponseController, ForensicsController } from './incident-response.controller';

@Module({
  imports: [ConfigModule],
  controllers: [IncidentResponseController, ForensicsController],
  providers: [IncidentResponseService, ForensicsService],
  exports: [IncidentResponseService, ForensicsService],
})
export class IncidentResponseModule {}

// Re-export types
export * from './types';
export { IncidentResponseService } from './incident-response.service';
export { ForensicsService } from './forensics.service';
export { IncidentResponseController, ForensicsController } from './incident-response.controller';
