import { Module } from '@nestjs/common';

import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { OltController } from './olt.controller';
import { OltService } from './olt.service';
import { OnuController } from './onu.controller';
import { OnuService } from './onu.service';

@Module({
  controllers: [OltController, OnuController],
  providers: [OltService, OnuService, AdminRoleGuard],
})
export class InventoryModule {}
