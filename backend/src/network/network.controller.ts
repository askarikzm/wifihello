import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { SupabaseUser } from '../common/types/supabase-user';
import { NetworkService } from './network.service';

@Controller('network')
@UseGuards(SupabaseJwtGuard)
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  /**
   * Get current ONU status for authenticated user
   */
  @Get('status')
  status(@CurrentUser() user: SupabaseUser) {
    return this.networkService.getStatus(user.id);
  }

  /**
   * Request ONU reboot for authenticated user
   */
  @Post('reboot')
  reboot(@CurrentUser() user: SupabaseUser) {
    return this.networkService.reboot(user.id);
  }
}
