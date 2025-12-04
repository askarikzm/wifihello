/**
 * NetAxis ISP - CTDISR-2025 Network Security Module
 */

import { Module } from '@nestjs/common';
import { NetworkSecurityService } from './network-security.service';
import { NetworkSecurityController } from './network-security.controller';

@Module({
  controllers: [NetworkSecurityController],
  providers: [NetworkSecurityService],
  exports: [NetworkSecurityService],
})
export class NetworkSecurityModule {}

export * from './network-security.service';
export * from './types';
