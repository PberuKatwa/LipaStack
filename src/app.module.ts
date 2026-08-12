import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { globalConfig, paystackConfig } from './config/env.config';
import { AppLoggerModule } from './logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [globalConfig, paystackConfig],
      isGlobal: true,
    }),
    AppLoggerModule,
  ],
})
export class AppModule {}
