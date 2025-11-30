import { Module } from '@nestjs/common';

import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PayFastGateway } from './gateways/payfast.gateway';
import { JazzCashGateway } from './gateways/jazzcash.gateway';
import { EasyPaisaGateway } from './gateways/easypaisa.gateway';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, PayFastGateway, JazzCashGateway, EasyPaisaGateway],
  exports: [PaymentService],
})
export class PaymentModule {}
