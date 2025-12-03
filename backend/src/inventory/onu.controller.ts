import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { AdminUser } from '../common/types/admin-user';
import { OnuService } from './onu.service';

@Controller('onus')
@UseGuards(SupabaseJwtGuard, AdminRoleGuard)
export class OnuController {
  constructor(private readonly onuService: OnuService) {}

  @Get()
  listOnus(
    @CurrentUser() user: AdminUser,
    @Query('oltId') oltId?: string,
    @Query('regionId') regionId?: string,
    @Query('cityId') cityId?: string,
    @Query('districtId') districtId?: string,
    @Query('areaId') areaId?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.onuService.listOnus(user, {
      oltId,
      regionId,
      cityId,
      districtId,
      areaId,
      search,
      page,
      limit: typeof limit === 'string' ? Number(limit) : limit,
    });
  }

  @Get('search')
  searchOnus(@CurrentUser() user: AdminUser, @Query('q') q?: string) {
    return this.onuService.searchOnus(user, q?.trim() || '');
  }

  @Get(':id')
  getOnu(@CurrentUser() user: AdminUser, @Param('id') onuId: string) {
    return this.onuService.getOnu(user, onuId);
  }
}
