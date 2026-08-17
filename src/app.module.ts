import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { globalConfig, paystackConfig } from './config/env.config';
import { AppLoggerModule } from './logger/logger.module';
import { PaystackModule } from './modules/paystack/paystack.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [globalConfig, paystackConfig],
      isGlobal: true,
    }),
    AppLoggerModule,
    PaystackModule,
  ],
})
export class AppModule {}
