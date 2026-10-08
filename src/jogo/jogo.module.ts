import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JogoService } from './jogo.service.js';
import { PersonagensController } from './personagens.controller.js';
import { QuizController } from './quiz.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [PersonagensController, QuizController],
  providers: [JogoService],
})
export class JogoModule {}
