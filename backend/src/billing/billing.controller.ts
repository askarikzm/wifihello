import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(SupabaseJwtGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  listInvoices(@CurrentUser() user: any) {
    return this.billingService.listInvoices(user.sub, user.tenant_id);
  }
}
