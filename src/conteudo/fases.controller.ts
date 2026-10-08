import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UsuarioAtual } from '../auth/auth.decorators.js';
import type { UsuarioAutenticado } from '../auth/auth.types.js';
import { ErroDto } from '../auth/dto/respostas.dto.js';
import { ConteudoService } from './conteudo.service.js';
import { QuestaoDto } from './dto/conteudo.dto.js';

@ApiTags('conteúdo')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
@Controller('fases')
export class FasesController {
  constructor(private readonly conteudo: ConteudoService) {}

  @Get(':id/questoes')
  @ApiOperation({
    summary: 'Questões da fase com as alternativas',
    description:
      'Aluno recebe as alternativas SEM o campo `correta`. Admin e o professor do Reino da fase recebem com `correta`.',
  })
  @ApiOkResponse({ type: [QuestaoDto] })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Fase não encontrada' })
  questoes(@UsuarioAtual() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.conteudo.listarQuestoes(usuario, id);
  }
}
