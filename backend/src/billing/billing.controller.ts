import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { SupabaseUser } from '../common/types/supabase-user';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(SupabaseJwtGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  listInvoices(@CurrentUser() user: SupabaseUser) {
    return this.billingService.listInvoices(user.id);
  }
}
