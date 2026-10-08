import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConteudoModule } from '../conteudo/conteudo.module.js';
import { AdminController, QuestoesGestaoController } from './gestao.controller.js';
import { GestaoService } from './gestao.service.js';

@Module({
  imports: [AuthModule, ConteudoModule],
  controllers: [QuestoesGestaoController, AdminController],
  providers: [GestaoService],
})
export class GestaoModule {}
