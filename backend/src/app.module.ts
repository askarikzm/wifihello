import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { PaymentModule } from './payment/payment.module';
import { UsageModule } from './usage/usage.module';
import { NetworkModule } from './network/network.module';
import { AdminModule } from './admin/admin.module';
import { DatabaseModule } from './database/database.module';
import configuration from './config/configuration';
import configurationValidation from './config/validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: configurationValidation,
    }),
    LoggerModule.forRoot({ pinoHttp: { transport: { target: 'pino-pretty' } } }),
    DatabaseModule,
    AuthModule,
    BillingModule,
    PaymentModule,
    UsageModule,
    NetworkModule,
    AdminModule,
  ],
})
export class AppModule {}
