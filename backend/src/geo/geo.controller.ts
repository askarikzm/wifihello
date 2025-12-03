import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { AdminUser } from '../common/types/admin-user';
import { GeoService } from './geo.service';

@Controller('geo')
@UseGuards(SupabaseJwtGuard, AdminRoleGuard)
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('regions')
  listRegions(
    @CurrentUser() user: AdminUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit') limit?: number,
  ) {
    return this.geoService.listRegions(user, {
      page,
      limit: typeof limit === 'string' ? Number(limit) : limit,
    });
  }

  @Get('regions/:regionId/cities')
  listCities(
    @CurrentUser() user: AdminUser,
    @Param('regionId') regionId: string,
  ) {
    return this.geoService.listCities(user, regionId);
  }

  @Get('cities/:cityId/districts')
  listDistricts(
    @CurrentUser() user: AdminUser,
    @Param('cityId') cityId: string,
  ) {
    return this.geoService.listDistricts(user, cityId);
  }

  @Get('districts/:districtId/areas')
  listAreas(
    @CurrentUser() user: AdminUser,
    @Param('districtId') districtId: string,
  ) {
    return this.geoService.listAreas(user, districtId);
  }

  @Get('tree')
  getTree(@CurrentUser() user: AdminUser) {
    return this.geoService.getTree(user);
  }
}
