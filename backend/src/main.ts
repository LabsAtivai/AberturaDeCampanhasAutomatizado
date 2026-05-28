import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) =>
          Object.values(e.constraints || {}),
        );
        const { BadRequestException } = require('@nestjs/common');
        return new BadRequestException(messages);
      },
    }),
  );

  app.enableCors({
    origin: [
      'https://aberturas.labsativa.com.br',
      'http://aberturas.labsativa.com.br',
      'http://localhost:4173',
      'http://localhost:8080',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
    exposedHeaders: ['Content-Disposition'],
  });

  app.setGlobalPrefix('api');

  await app.listen(3000);
  logger.log('Backend rodando em http://localhost:3000');
}
bootstrap();
