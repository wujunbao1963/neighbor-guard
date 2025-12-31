import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { NgExceptionFilter } from './common/errors/ng-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Keep logs minimal for Step 0
    logger: ['error', 'warn', 'log'],
  });

  // For DTO-based validation. This approximates contract strictness by
  // rejecting unknown fields.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Contract-aligned error envelope.
  app.useGlobalFilters(new NgExceptionFilter());

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`NG server listening on http://localhost:${port}`);
}

bootstrap();
