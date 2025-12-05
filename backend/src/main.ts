// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
  origin: [
    'https://aberturas.labsativa.com.br'
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
}); // deixa o Vue falar com o Nest

  await app.listen(3000); // 👈 volta pra 3000
}
bootstrap();

