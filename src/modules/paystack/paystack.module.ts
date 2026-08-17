import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PaystackClient } from './paystack.client';
import { PaystackController } from './paystack.controller';
import { PaystackService } from './paystack.service';

@Module({
  imports: [HttpModule],
  controllers: [PaystackController],
  providers: [PaystackClient, PaystackService],
  exports: [PaystackService],
})
export class PaystackModule {}
