import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles, UsuarioAtual } from '../auth/auth.decorators.js';
import type { UsuarioAutenticado } from '../auth/auth.types.js';
import { ErroDto } from '../auth/dto/respostas.dto.js';
import { ResponderFaseDto } from './dto/responder-fase.dto.js';
import { ResultadoFaseDto } from './dto/respostas-jogo.dto.js';
import { JogoService } from './jogo.service.js';

@ApiTags('jogo')
@ApiBearerAuth()
@Controller('fases')
export class QuizController {
  constructor(private readonly jogo: JogoService) {}

  @Post(':id/responder')
  @Roles('aluno')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Responde a fase: corrige no servidor e grava o progresso',
    description:
      'Uma resposta para cada questão da fase. Refazer a fase com nota pior não reduz as estrelas. ' +
      'Total de estrelas e título são atualizados pelo banco.',
  })
  @ApiOkResponse({ type: ResultadoFaseDto })
  @ApiBadRequestResponse({ type: ErroDto, description: 'Faltou questão, questão repetida ou alternativa de outra questão' })
  @ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
  @ApiForbiddenResponse({ type: ErroDto, description: 'Só aluno joga' })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Fase não existe ou o aluno não tem personagem' })
  responder(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResponderFaseDto,
  ) {
    return this.jogo.responderFase(usuario.id, id, dto);
  }
}
