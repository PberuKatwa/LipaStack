import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpClientModule, type HttpClientFactoryOptions } from '@nestjs/http-client';
import { PaystackClient } from './paystack.client';
import { PaystackController } from './paystack.controller';
import { PaystackService } from './paystack.service';

@Module({
  imports: [
    HttpClientModule.registerAsync({
      name: 'paystack',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): HttpClientFactoryOptions => ({
        baseUrl: 'https://api.paystack.co',
        headers: {
          Authorization: `Bearer ${configService.getOrThrow<string>('secretKey')}`,
        },
      }),
    }),
  ],
  controllers: [PaystackController],
  providers: [PaystackClient, PaystackService],
  exports: [PaystackService],
})
export class PaystackModule {}
