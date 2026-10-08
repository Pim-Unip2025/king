import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { ErroDto, UsuarioPublicoDto } from '../auth/dto/respostas.dto.js';
import { QuestaoDto } from '../conteudo/dto/conteudo.dto.js';
import {
  CriarQuestaoDto,
  EstatisticasAdminDto,
  ListarUsuariosQueryDto,
  QuestaoExcluidaDto,
  UsuarioAdminDto,
  UsuarioExcluidoDto,
  VincularReinoDto,
} from './dto/gestao.dto.js';
import { GestaoService } from './gestao.service.js';

// Rotas do professor. O @Roles barra o aluno; o AcessoService (dentro do
// service) barra o professor fora do Reino dele. Admin passa nos dois.
@ApiTags('professor')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
@ApiForbiddenResponse({ type: ErroDto, description: 'Aluno, ou professor de outro Reino' })
@Roles('professor', 'admin')
@Controller()
export class QuestoesGestaoController {
  constructor(private readonly gestao: GestaoService) {}

  @Post('fases/:id/questoes')
  @ApiOperation({ summary: 'Cria questão com as alternativas numa fase do Reino do professor' })
  @ApiCreatedResponse({ type: QuestaoDto, description: 'A questão criada, com `correta` nas alternativas' })
  @ApiBadRequestResponse({ type: ErroDto, description: 'Campos inválidos, ou zero/duas alternativas corretas' })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Fase não encontrada' })
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) faseId: number,
    @Body() dto: CriarQuestaoDto,
  ) {
    return this.gestao.criarQuestao(usuario, faseId, dto);
  }

  @Delete('questoes/:id')
  @ApiOperation({ summary: 'Exclui questão do Reino do professor (alternativas e respostas vão junto)' })
  @ApiOkResponse({ type: QuestaoExcluidaDto })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Questão não encontrada' })
  excluir(@UsuarioAtual() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.gestao.excluirQuestao(usuario, id);
  }

  @Get('professor/fases/:id/questoes')
  @ApiOperation({ summary: 'Questões da fase com o campo `correta` (só o Reino do professor)' })
  @ApiOkResponse({ type: [QuestaoDto] })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Fase não encontrada' })
  listar(@UsuarioAtual() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.gestao.listarQuestoesParaGestao(usuario, id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
@ApiForbiddenResponse({ type: ErroDto, description: 'Usuário não é admin' })
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly gestao: GestaoService) {}

  @Get('estatisticas')
  @ApiOperation({ summary: 'Números gerais da plataforma' })
  @ApiOkResponse({ type: EstatisticasAdminDto })
  estatisticas() {
    return this.gestao.estatisticas();
  }

  @Get('usuarios')
  @ApiOperation({ summary: 'Lista usuários, ordenados por papel e nome' })
  @ApiOkResponse({ type: [UsuarioAdminDto] })
  usuarios(@Query() query: ListarUsuariosQueryDto) {
    return this.gestao.listarUsuarios(query.papel);
  }

  @Delete('usuarios/:id')
  @ApiOperation({
    summary: 'Exclui um aluno — SEM VOLTA',
    description: 'Personagem, progresso e respostas vão junto (CASCADE); a resposta diz quantos registros foram apagados. Professor e admin são protegidos.',
  })
  @ApiOkResponse({ type: UsuarioExcluidoDto })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Usuário não encontrado' })
  excluir(@UsuarioAtual() admin: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.gestao.excluirUsuario(admin, id);
  }

  @Patch('usuarios/:id/reino')
  @ApiOperation({ summary: 'Vincula um professor a um Reino' })
  @ApiOkResponse({ type: UsuarioPublicoDto })
  @ApiBadRequestResponse({ type: ErroDto, description: 'Usuário não é professor, ou Reino não existe' })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Usuário não encontrado' })
  vincularReino(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VincularReinoDto,
  ) {
    return this.gestao.vincularReino(admin, id, dto.reino_id);
  }
}
