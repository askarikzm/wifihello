import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { NetworkService } from './network.service';

@Controller('network')
@UseGuards(SupabaseJwtGuard)
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  @Get('olt/status/:customerId')
  status(@Param('customerId') customerId: string) {
    return this.networkService.getStatus(customerId);
  }
}
