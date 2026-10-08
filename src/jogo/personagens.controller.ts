import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { CriarPersonagemDto } from './dto/criar-personagem.dto.js';
import { PersonagemDto, ProgressoFaseDto } from './dto/respostas-jogo.dto.js';
import { JogoService } from './jogo.service.js';

@ApiTags('jogo')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
@ApiForbiddenResponse({ type: ErroDto, description: 'Só aluno tem personagem' })
@Roles('aluno')
@Controller('personagens')
export class PersonagensController {
  constructor(private readonly jogo: JogoService) {}

  @Post()
  @ApiOperation({ summary: 'Cria o personagem do aluno logado', description: 'Nasce Plebeu com 0 estrelas.' })
  @ApiCreatedResponse({ type: PersonagemDto })
  @ApiBadRequestResponse({ type: ErroDto, description: 'Nome, gênero ou avatar inválido' })
  @ApiConflictResponse({ type: ErroDto, description: 'O aluno já tem personagem' })
  criar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dto: CriarPersonagemDto) {
    return this.jogo.criarPersonagem(usuario.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Personagem do aluno logado, com título e total de estrelas' })
  @ApiOkResponse({ type: PersonagemDto })
  @ApiNotFoundResponse({ type: ErroDto, description: 'O aluno ainda não criou personagem' })
  me(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.jogo.meuPersonagem(usuario.id);
  }

  @Get('me/progresso')
  @ApiOperation({ summary: 'Estrelas por fase, incluindo as fases ainda não jogadas' })
  @ApiOkResponse({ type: [ProgressoFaseDto] })
  @ApiNotFoundResponse({ type: ErroDto, description: 'O aluno ainda não criou personagem' })
  progresso(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.jogo.meuProgresso(usuario.id);
  }
}
