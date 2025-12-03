/**
 * CTDISR-2025 Vendor & Third-Party Security Module
 * PTA Regulation: Chapter 9 - Third-Party Risk Management
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VendorService } from './vendor.service';
import { VendorAssessmentService } from './vendor-assessment.service';
import { VendorController, VendorAssessmentController } from './vendor-security.controller';

@Module({
  imports: [ConfigModule],
  controllers: [VendorController, VendorAssessmentController],
  providers: [VendorService, VendorAssessmentService],
  exports: [VendorService, VendorAssessmentService],
})
export class VendorSecurityModule {}

// Re-export types
export * from './types';
