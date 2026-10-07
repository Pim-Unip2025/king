import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarApp } from './app.setup.js';
import { configurarDocs } from './docs.setup.js';

async function bootstrap() {
  const app = configurarDocs(configurarApp(await NestFactory.create(AppModule)));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
