import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErroDto } from '../auth/dto/respostas.dto.js';
import { ConteudoService } from './conteudo.service.js';
import { FaseDto, ReinoDto } from './dto/conteudo.dto.js';

@ApiTags('conteúdo')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
@Controller('reinos')
export class ReinosController {
  constructor(private readonly conteudo: ConteudoService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os Reinos (disciplinas) com descrição' })
  @ApiOkResponse({ type: [ReinoDto] })
  listar() {
    return this.conteudo.listarReinos();
  }

  @Get(':id/fases')
  @ApiOperation({ summary: 'Fases do Reino, na ordem (1, 2, 3)' })
  @ApiOkResponse({ type: [FaseDto] })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Reino não encontrado' })
  fases(@Param('id', ParseIntPipe) id: number) {
    return this.conteudo.listarFases(id);
  }
}
