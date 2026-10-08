import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConteudoService } from './conteudo.service.js';
import { FasesController } from './fases.controller.js';
import { ReinosController } from './reinos.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [ReinosController, FasesController],
  providers: [ConteudoService],
})
export class ConteudoModule {}
