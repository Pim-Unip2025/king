import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ConteudoModule } from './conteudo/conteudo.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DesempenhoModule } from './desempenho/desempenho.module.js';
import { GestaoModule } from './gestao/gestao.module.js';
import { HealthController } from './health/health.controller.js';
import { JogoModule } from './jogo/jogo.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    ConteudoModule,
    JogoModule,
    DesempenhoModule,
    GestaoModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
