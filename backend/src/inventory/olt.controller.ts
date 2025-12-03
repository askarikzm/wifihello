import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { AdminUser } from '../common/types/admin-user';
import { OltService } from './olt.service';

@Controller('olts')
@UseGuards(SupabaseJwtGuard, AdminRoleGuard)
export class OltController {
  constructor(private readonly oltService: OltService) {}

  @Get()
  listOlts(
    @CurrentUser() user: AdminUser,
    @Query('regionId') regionId?: string,
    @Query('cityId') cityId?: string,
    @Query('districtId') districtId?: string,
    @Query('areaId') areaId?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.oltService.listOlts(user, {
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
  searchOlts(@CurrentUser() user: AdminUser, @Query('q') q?: string) {
    return this.oltService.searchOlts(user, q?.trim() || '');
  }

  @Get(':id')
  getOlt(@CurrentUser() user: AdminUser, @Param('id') oltId: string) {
    return this.oltService.getOlt(user, oltId);
  }
}
