import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
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
import { DesempenhoService } from './desempenho.service.js';
import { AlunoBuscaDto, BuscarAlunosQueryDto, EstatisticaFaseDto, ResumoGeralDto } from './dto/desempenho.dto.js';

// Dashboard do aluno. Sem id na URL: é sempre o personagem do token.
@ApiTags('desempenho')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
@ApiForbiddenResponse({ type: ErroDto, description: 'Usuário não é aluno' })
@ApiNotFoundResponse({ type: ErroDto, description: 'O aluno ainda não criou personagem' })
@Roles('aluno')
@Controller('personagens/me')
export class MeuDesempenhoController {
  constructor(private readonly desempenho: DesempenhoService) {}

  @Get('estatisticas')
  @ApiOperation({ summary: 'Tentativas, acertos, taxa de acerto e estrelas por fase do aluno logado' })
  @ApiOkResponse({ type: [EstatisticaFaseDto] })
  estatisticas(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.desempenho.minhasEstatisticas(usuario.id);
  }

  @Get('resumo')
  @ApiOperation({ summary: 'Números consolidados do topo do dashboard do aluno logado' })
  @ApiOkResponse({ type: ResumoGeralDto })
  resumo(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.desempenho.meuResumo(usuario.id);
  }
}

// Painel do professor (o admin também enxerga).
@ApiTags('desempenho')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
@ApiForbiddenResponse({ type: ErroDto, description: 'Usuário não é professor nem admin' })
@Roles('professor', 'admin')
@Controller('professor/alunos')
export class ProfessorAlunosController {
  constructor(private readonly desempenho: DesempenhoService) {}

  @Get()
  @ApiOperation({ summary: 'Busca alunos pelo nome de usuário (sem diferenciar maiúsculas)' })
  @ApiOkResponse({ type: [AlunoBuscaDto] })
  @ApiBadRequestResponse({ type: ErroDto, description: 'Parâmetro de busca inválido' })
  buscar(@Query() query: BuscarAlunosQueryDto) {
    return this.desempenho.buscarAlunos(query.nome);
  }

  @Get(':id/desempenho')
  @ApiOperation({
    summary: 'Desempenho por fase de um aluno',
    description: '`:id` é o `usuario_id` devolvido pela busca.',
  })
  @ApiOkResponse({ type: [EstatisticaFaseDto] })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Aluno não existe ou ainda não criou personagem' })
  desempenhoDoAluno(@UsuarioAtual() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.desempenho.desempenhoDoAluno(usuario, id);
  }
}
