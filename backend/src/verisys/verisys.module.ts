import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { KycController } from './kyc.controller';
import { VerisysService } from './verisys.service';
import { DatabaseModule } from '../database/database.module';

/**
 * Verisys Module
 * 
 * Self-contained module for NADRA Verisys CNIC verification.
 * Can be optionally included/excluded based on client requirements.
 * 
 * Features:
 * - CNIC verification via NADRA Verisys API
 * - Rate limiting per user
 * - Audit logging for compliance
 * - Admin management endpoints
 * 
 * @regulatory PTRA 1996, PTA KYC Rules, CTDISR
 * @optional This module can be excluded for clients who don't need KYC
 */
@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
    DatabaseModule,
  ],
  controllers: [KycController],
  providers: [VerisysService],
  exports: [VerisysService],
})
export class VerisysModule {}
