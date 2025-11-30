import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { SupabaseUser } from '../common/types/supabase-user';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('intent')
  @UseGuards(SupabaseJwtGuard)
  createIntent(@Body() dto: CreatePaymentIntentDto, @CurrentUser() user: SupabaseUser) {
    return this.paymentService.createIntent(dto, user.id);
  }

  @Get('history')
  @UseGuards(SupabaseJwtGuard)
  getHistory(@CurrentUser() user: SupabaseUser) {
    return this.paymentService.getPaymentHistory(user.id);
  }

  @Get('status/:paymentId')
  @UseGuards(SupabaseJwtGuard)
  getStatus(@Param('paymentId') paymentId: string, @CurrentUser() user: SupabaseUser) {
    return this.paymentService.getPaymentStatus(paymentId, user.id);
  }

  @Post('webhook/:gateway')
  async webhookByGateway(
    @Param('gateway') gateway: string,
    @Req() request: Request,
    @Headers('x-gateway-signature') signature: string,
  ) {
    await this.paymentService.handleWebhook({
      rawBody: request.body,
      signature,
      headers: request.headers as Record<string, string>,
      gateway,
    });
    return { received: true };
  }

  @Post('webhook')
  async webhook(
    @Req() request: Request,
    @Headers('x-gateway-signature') signature: string,
    @Query('gateway') gateway: string,
  ) {
    await this.paymentService.handleWebhook({
      rawBody: request.body,
      signature,
      headers: request.headers as Record<string, string>,
      gateway: gateway || 'payfast',
    });
    return { received: true };
  }
}
