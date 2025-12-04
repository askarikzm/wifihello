/**
 * NetAxis ISP - CTDISR-2025 Asset Management Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssetService } from './asset.service';
import { AssetController } from './asset.controller';
import { CtdisrModule } from '../ctdisr.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => CtdisrModule), // Use forwardRef for circular dependency
  ],
  controllers: [AssetController],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetModule {}
