import { Module } from '@nestjs/common';

import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';

@Module({
  controllers: [GeoController],
  providers: [GeoService, AdminRoleGuard],
  exports: [GeoService],
})
export class GeoModule {}
