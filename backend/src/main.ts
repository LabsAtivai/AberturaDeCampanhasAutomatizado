import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Configuração de CORS mais permissiva
  app.enableCors({
    origin: [
      'https://aberturas.labsativa.com.br',
      'http://aberturas.labsativa.com.br',
      'http://localhost:4173',
      'http://localhost:8080'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials'
    ],
    exposedHeaders: ['Content-Disposition'],
  });

  // Prefixo global para todas as rotas
  app.setGlobalPrefix('api');

  await app.listen(3000);
  console.log('🚀 Backend rodando em http://localhost:3000');
}
bootstrap();
