import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MeuDesempenhoController, ProfessorAlunosController } from './desempenho.controller.js';
import { DesempenhoService } from './desempenho.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MeuDesempenhoController, ProfessorAlunosController],
  providers: [DesempenhoService],
})
export class DesempenhoModule {}
