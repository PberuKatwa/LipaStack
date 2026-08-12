import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { globalConfig } from './config/env.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const { port } = globalConfig();
  await app.listen(port);
}

void bootstrap();
