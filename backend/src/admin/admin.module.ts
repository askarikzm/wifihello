import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';

@Module({
  imports: [HttpModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRoleGuard],
  exports: [AdminService],
})
export class AdminModule {}
