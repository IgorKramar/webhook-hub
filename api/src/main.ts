import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  setupApp(app);
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Webhook Hub')
    .setDescription('Приём, хранение и переигрывание вебхук-событий')
    .setVersion('1.0')
    .addTag('sources')
    .addTag('events')
    .addTag('webhooks')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document); // строго ДО listen!

  const port = Number(process.env.API_PORT ?? 4002);
  await app.listen(port, '0.0.0.0');
  console.log(`API:  http://localhost:${port}`);
  console.log(`Docs: http://localhost:${port}/docs`);
}
void bootstrap();
