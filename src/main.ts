import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';

async function bootstrap() {
  const app = configurarApp(await NestFactory.create(AppModule));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
