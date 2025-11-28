import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(json({ limit: '2mb' }));
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 9000;
  await app.listen(port);
  Logger.log(`WANCOM API listening on port ${port}`);
}

void bootstrap();
