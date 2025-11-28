import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(SupabaseJwtGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: any) {
    return this.adminService.dashboard(user.sub);
  }
}
