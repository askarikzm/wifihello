import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('intent')
  @UseGuards(SupabaseJwtGuard)
  createIntent(@Body() dto: CreatePaymentIntentDto, @CurrentUser() user: any) {
    return this.paymentService.createIntent(dto, user.sub);
  }

  @Post('webhook')
  async webhook(
    @Req() request: Request,
    @Headers('x-gateway-signature') signature: string,
  ) {
    await this.paymentService.handleWebhook({
      rawBody: request.body,
      signature,
      headers: request.headers,
    });
    return { received: true };
  }
}
