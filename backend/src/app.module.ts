import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { PaymentModule } from './payment/payment.module';
import { UsageModule } from './usage/usage.module';
import { NetworkModule } from './network/network.module';
import { AdminModule } from './admin/admin.module';
import { SupportModule } from './support/support.module';
import { NotificationModule } from './notification/notification.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { VerisysModule } from './verisys/verisys.module';
import configuration from './config/configuration';
import configurationValidation from './config/validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: configurationValidation,
    }),
    LoggerModule.forRoot({ 
      pinoHttp: { 
        transport: { 
          target: 'pino-pretty',
          options: {
            colorize: true,
            levelFirst: true,
            translateTime: 'SYS:standard',
          },
        },
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      } 
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    BillingModule,
    PaymentModule,
    UsageModule,
    NetworkModule,
    AdminModule,
    SupportModule,
    NotificationModule,
    HealthModule,
    VerisysModule, // Optional: NADRA KYC verification module
  ],
})
export class AppModule {}
