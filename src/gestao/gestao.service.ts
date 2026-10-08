import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AcessoService } from '../auth/acesso.service.js';
import type { Papel, UsuarioAutenticado, UsuarioPublico } from '../auth/auth.types.js';
import { ConteudoService, type Questao } from '../conteudo/conteudo.service.js';
import { DatabaseService } from '../database/database.service.js';
import { ehErroPostgres } from '../comum/erros-postgres.js';
import type { CriarQuestaoDto } from './dto/gestao.dto.js';

const COLUNAS_PUBLICAS = 'id, nome, email, papel, professor_reino_id';

// Painel do professor (questões do Reino dele) e do admin (usuários e números
// gerais). É o que o cliente WinForms consome. Substitui criarQuestao(),
// excluirQuestao(), listarQuestoesDaFase() do js/database.js e o script do
// admin.html.
@Injectable()
export class GestaoService {
  private readonly logger = new Logger('Gestao');

  constructor(
    private readonly db: DatabaseService,
    private readonly acesso: AcessoService,
    private readonly conteudo: ConteudoService,
  ) {}

  // --------------------------------------------------------------------------
  // Questões
  // --------------------------------------------------------------------------

  /**
   * Questão + alternativas numa transação só. "Exatamente uma correta" é
   * regra do BANCO (trg_valida_alternativa_correta), não daqui: a trigger é
   * deferida e explode no COMMIT, que é quando o erro chega. Ele vira 400.
   */
  async criarQuestao(usuario: UsuarioAutenticado, faseId: number, dto: CriarQuestaoDto): Promise<Questao> {
    await this.acesso.garantirFase(usuario, faseId);

    let questaoId: number;
    try {
      questaoId = await this.db.transacao(async (query) => {
        const { rows } = await query<{ id: number }>(
          'INSERT INTO questoes (fase_id, enunciado, nivel_dificuldade) VALUES ($1, $2, $3) RETURNING id',
          [faseId, dto.enunciado, dto.nivel_dificuldade],
        );
        await query(
          `INSERT INTO alternativas (questao_id, letra, texto, correta)
           SELECT $1, t.letra, t.texto, t.correta
             FROM unnest($2::text[], $3::text[], $4::boolean[]) AS t(letra, texto, correta)`,
          [
            rows[0].id,
            dto.alternativas.map((a) => a.letra),
            dto.alternativas.map((a) => a.texto),
            dto.alternativas.map((a) => a.correta),
          ],
        );
        return rows[0].id;
      });
    } catch (erro) {
      // RAISE da trigger (check_violation sem constraint). A mensagem do banco
      // cita o id da questão, que nem existe mais depois do ROLLBACK.
      if (ehErroPostgres(erro) && erro.code === '23514' && !erro.constraint) {
        const corretas = /encontradas: (\d+)/.exec(erro.message)?.[1] ?? '?';
        throw new BadRequestException(`A questão precisa ter exatamente uma alternativa correta (marcadas: ${corretas}).`);
      }
      throw erro;
    }

    this.logger.log(`Questão criada: questao=${questaoId} fase=${faseId} por usuario=${usuario.id}`);
    const questoes = await this.conteudo.listarQuestoes(usuario, faseId);
    return questoes.find((q) => q.id === questaoId)!;
  }

  async excluirQuestao(usuario: UsuarioAutenticado, questaoId: number) {
    await this.acesso.garantirQuestao(usuario, questaoId);

    const respostas = await this.db.transacao(async (query) => {
      const { rows } = await query<{ n: number }>(
        'SELECT count(*)::int AS n FROM respostas_usuario WHERE questao_id = $1',
        [questaoId],
      );
      // Alternativas e respostas vão junto por CASCADE.
      await query('DELETE FROM questoes WHERE id = $1', [questaoId]);
      return rows[0].n;
    });

    this.logger.log(`Questão excluída: questao=${questaoId} respostas_apagadas=${respostas} por usuario=${usuario.id}`);
    return { mensagem: 'Questão excluída.', questao_id: questaoId, respostas_apagadas: respostas };
  }

  /** Questões da fase COM o `correta`, só para quem gerencia o Reino. */
  async listarQuestoesParaGestao(usuario: UsuarioAutenticado, faseId: number): Promise<Questao[]> {
    await this.acesso.garantirFase(usuario, faseId);
    return this.conteudo.listarQuestoes(usuario, faseId);
  }

  // --------------------------------------------------------------------------
  // Admin
  // --------------------------------------------------------------------------

  async estatisticas() {
    const { rows } = await this.db.query(
      `SELECT
         (SELECT count(*)::int FROM usuarios)                              AS usuarios,
         (SELECT count(*)::int FROM usuarios WHERE papel = 'aluno')        AS alunos,
         (SELECT count(*)::int FROM usuarios WHERE papel = 'professor')    AS professores,
         (SELECT count(*)::int FROM usuarios WHERE papel = 'admin')        AS admins,
         (SELECT count(*)::int FROM personagens)                           AS personagens,
         (SELECT count(*)::int FROM questoes)                              AS questoes,
         (SELECT count(*)::int FROM respostas_usuario)                     AS respostas,
         (SELECT COALESCE(round(count(*) FILTER (WHERE acertou)::numeric
                                / NULLIF(count(*), 0) * 100, 1), 0)::float8
            FROM respostas_usuario)                                        AS taxa_acerto,
         (SELECT jsonb_build_object(
                   'Plebeu',    count(*) FILTER (WHERE titulo_atual = 'Plebeu'),
                   'Cavaleiro', count(*) FILTER (WHERE titulo_atual = 'Cavaleiro'),
                   'Duque',     count(*) FILTER (WHERE titulo_atual = 'Duque'),
                   'Rei',       count(*) FILTER (WHERE titulo_atual = 'Rei'))
            FROM personagens)                                              AS personagens_por_titulo`,
    );
    return rows[0];
  }

  async listarUsuarios(papel?: Papel) {
    const { rows } = await this.db.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.professor_reino_id,
              r.nome AS reino_nome, p.id AS personagem_id, u.criado_em
         FROM usuarios u
         LEFT JOIN reinos r ON r.id = u.professor_reino_id
         LEFT JOIN personagens p ON p.usuario_id = u.id
        WHERE $1::text IS NULL OR u.papel = $1
        ORDER BY u.papel, u.nome`,
      [papel ?? null],
    );
    return rows;
  }

  /**
   * Exclusão SEM VOLTA. Personagem, progresso e respostas vão por CASCADE;
   * a resposta diz quantos registros sumiram.
   *
   * Professor e admin são protegidos, como no admin.html do PIM III: não há
   * rota para recriá-los, e apagar um admin pode trancar o sistema.
   */
  async excluirUsuario(admin: UsuarioAutenticado, usuarioId: number) {
    const apagados = await this.db.transacao(async (query) => {
      const { rows: alvo } = await query<{ papel: Papel }>(
        'SELECT papel FROM usuarios WHERE id = $1 FOR UPDATE',
        [usuarioId],
      );
      if (!alvo[0]) throw new NotFoundException('Usuário não encontrado.');
      if (alvo[0].papel !== 'aluno') {
        throw new ForbiddenException('Professor e administrador são protegidos e não podem ser excluídos.');
      }

      const { rows: contagem } = await query<{ personagens: number; progresso_fases: number; respostas_usuario: number }>(
        `SELECT
           (SELECT count(*)::int FROM personagens WHERE usuario_id = $1) AS personagens,
           (SELECT count(*)::int FROM progresso_fases pf JOIN personagens p ON p.id = pf.personagem_id
             WHERE p.usuario_id = $1) AS progresso_fases,
           (SELECT count(*)::int FROM respostas_usuario ru JOIN personagens p ON p.id = ru.personagem_id
             WHERE p.usuario_id = $1) AS respostas_usuario`,
        [usuarioId],
      );
      await query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
      return { usuarios: 1, ...contagem[0] };
    });

    this.logger.warn(
      `Usuário excluído: usuario=${usuarioId} por admin=${admin.id} ` +
        `(personagens=${apagados.personagens} progresso=${apagados.progresso_fases} respostas=${apagados.respostas_usuario})`,
    );
    return { mensagem: 'Usuário excluído. Esta ação não pode ser desfeita.', usuario_id: usuarioId, apagados };
  }

  /**
   * O CHECK ck_usuarios_reino_do_professor é quem impede vincular Reino a
   * aluno ou admin — o erro do banco vira 400 no filtro global. Reino que
   * não existe cai na FK e também vira 400.
   */
  async vincularReino(admin: UsuarioAutenticado, usuarioId: number, reinoId: number): Promise<UsuarioPublico> {
    const { rows } = await this.db.query<UsuarioPublico>(
      `UPDATE usuarios SET professor_reino_id = $1 WHERE id = $2 RETURNING ${COLUNAS_PUBLICAS}`,
      [reinoId, usuarioId],
    );
    if (!rows[0]) throw new NotFoundException('Usuário não encontrado.');
    this.logger.log(`Reino vinculado: professor=${usuarioId} reino=${reinoId} por admin=${admin.id}`);
    return rows[0];
  }
}
