import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ConteudoModule } from './conteudo/conteudo.module.js';
import { DatabaseModule } from './database/database.module.js';
import { JogoModule } from './jogo/jogo.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthModule, ConteudoModule, JogoModule],
  controllers: [HealthController],
})
export class AppModule {}