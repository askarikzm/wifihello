import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { UsageService } from './usage.service';

@Controller('usage')
@UseGuards(SupabaseJwtGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('daily')
  daily(@CurrentUser() user: any, @Query('limit') limit = 30) {
    return this.usageService.daily(user.sub, Number(limit));
  }
}
