import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AcessoService } from '../auth/acesso.service.js';
import { DatabaseService } from '../database/database.service.js';
import { CriarPersonagemDto } from './dto/criar-personagem.dto.js';
import { ResponderFaseDto } from './dto/responder-fase.dto.js';
import { AVATARES, estrelasDaTentativa } from './jogo.constants.js';

const COLUNAS_PERSONAGEM = 'id, nome, genero, avatar, titulo_atual, total_estrelas';

export interface Personagem {
  id: number;
  nome: string;
  genero: string;
  avatar: string;
  titulo_atual: string;
  total_estrelas: number;
}

// Personagem, progresso e quiz do aluno. Substitui salvarPersonagem(),
// buscarPersonagem(), atualizarProgresso(), buscarProgresso() e
// registrarResposta() do js/database.js do front.
//
// Todas as rotas daqui são do aluno logado: o personagem sai do TOKEN, nunca
// de um id na URL. Por isso não existe como um aluno gravar ou ler o
// progresso de outro.
@Injectable()
export class JogoService {
  constructor(
    private readonly db: DatabaseService,
    private readonly acesso: AcessoService,
  ) {}

  // --------------------------------------------------------------------------
  // POST /personagens
  // --------------------------------------------------------------------------
  async criarPersonagem(usuarioId: number, dto: CriarPersonagemDto): Promise<Personagem> {
    if (!(AVATARES[dto.genero] as readonly string[]).includes(dto.avatar)) {
      throw new BadRequestException('Esse avatar não é do gênero escolhido.');
    }
    try {
      // titulo_atual e total_estrelas ficam no DEFAULT do banco (Plebeu, 0).
      const { rows } = await this.db.query<Personagem>(
        `INSERT INTO personagens (usuario_id, nome, genero, avatar)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUNAS_PERSONAGEM}`,
        [usuarioId, dto.nome, dto.genero, dto.avatar],
      );
      return rows[0];
    } catch (erro) {
      // UNIQUE (usuario_id): um personagem por aluno.
      if ((erro as { code?: string }).code === '23505') {
        throw new ConflictException('Você já tem um personagem.');
      }
      throw erro;
    }
  }

  // --------------------------------------------------------------------------
  // GET /personagens/me
  // --------------------------------------------------------------------------
  async meuPersonagem(usuarioId: number): Promise<Personagem> {
    const { rows } = await this.db.query<Personagem>(
      `SELECT ${COLUNAS_PERSONAGEM} FROM personagens WHERE usuario_id = $1`,
      [usuarioId],
    );
    if (!rows[0]) throw this.semPersonagem();
    return rows[0];
  }

  // --------------------------------------------------------------------------
  // GET /personagens/me/progresso — todas as fases, inclusive as não jogadas
  // --------------------------------------------------------------------------
  async meuProgresso(usuarioId: number) {
    const personagemId = await this.idDoPersonagem(usuarioId);
    const { rows } = await this.db.query(
      `SELECT r.id AS reino_id, r.nome AS reino_nome,
              f.id AS fase_id, f.nome AS fase_nome, f.ordem,
              COALESCE(p.estrelas, 0)::int AS estrelas,
              (p.id IS NOT NULL) AS jogada
         FROM reinos r
         JOIN fases f ON f.reino_id = r.id
         LEFT JOIN progresso_fases p ON p.fase_id = f.id AND p.personagem_id = $1
        ORDER BY r.id, f.ordem`,
      [personagemId],
    );
    return rows;
  }

  // --------------------------------------------------------------------------
  // POST /fases/:id/responder
  //
  // O cliente manda só as alternativas escolhidas; quem sabe a resposta certa
  // é o banco. A API corrige, calcula as estrelas DESTA tentativa e grava:
  //   - uma linha por resposta em respostas_usuario
  //   - CALL sp_registrar_progresso, que guarda a MELHOR nota da fase
  // Total de estrelas e título o banco atualiza sozinho (trigger).
  // Tudo numa transação: ou grava tudo, ou nada.
  // --------------------------------------------------------------------------
  async responderFase(usuarioId: number, faseId: number, dto: ResponderFaseDto) {
    const personagemId = await this.idDoPersonagem(usuarioId);

    const { rows: fase } = await this.db.query('SELECT 1 FROM fases WHERE id = $1', [faseId]);
    if (!fase[0]) throw new NotFoundException('Fase não encontrada.');

    const { rows: gabarito } = await this.db.query<{ questao_id: number; alternativa_id: number; correta: boolean }>(
      `SELECT q.id AS questao_id, a.id AS alternativa_id, a.correta
         FROM questoes q
         JOIN alternativas a ON a.questao_id = q.id
        WHERE q.fase_id = $1`,
      [faseId],
    );

    // questao_id -> { alternativas da questão, id da correta }
    const questoes = new Map<number, { alternativas: Set<number>; correta: number }>();
    for (const linha of gabarito) {
      const q = questoes.get(linha.questao_id) ?? { alternativas: new Set<number>(), correta: 0 };
      q.alternativas.add(linha.alternativa_id);
      if (linha.correta) q.correta = linha.alternativa_id;
      questoes.set(linha.questao_id, q);
    }
    if (questoes.size === 0) throw new BadRequestException('Esta fase ainda não tem questões.');

    this.validarRespostas(dto, questoes);

    const correcao = dto.respostas.map(({ questaoId, alternativaId }) => {
      const correta = questoes.get(questaoId)!.correta;
      return {
        questao_id: questaoId,
        alternativa_escolhida_id: alternativaId,
        alternativa_correta_id: correta,
        acertou: alternativaId === correta,
      };
    });
    const acertos = correcao.filter((c) => c.acertou).length;
    const estrelas = estrelasDaTentativa(acertos, questoes.size);

    const { personagem, melhor } = await this.db.transacao(async (query) => {
      await query(
        `INSERT INTO respostas_usuario (personagem_id, questao_id, fase_id, acertou)
         SELECT $1, questao_id, $2, acertou
           FROM unnest($3::int[], $4::boolean[]) AS r(questao_id, acertou)`,
        [personagemId, faseId, correcao.map((c) => c.questao_id), correcao.map((c) => c.acertou)],
      );
      await query('CALL sp_registrar_progresso($1, $2, $3::smallint)', [personagemId, faseId, estrelas]);

      const { rows: p } = await query<{ estrelas: number }>(
        'SELECT estrelas FROM progresso_fases WHERE personagem_id = $1 AND fase_id = $2',
        [personagemId, faseId],
      );
      const { rows: pers } = await query<Personagem>(`SELECT ${COLUNAS_PERSONAGEM} FROM personagens WHERE id = $1`, [
        personagemId,
      ]);
      return { personagem: pers[0], melhor: p[0].estrelas };
    });

    return {
      fase_id: faseId,
      acertos,
      total: questoes.size,
      estrelas,
      melhor_estrelas: melhor,
      personagem,
      correcao,
    };
  }

  // --------------------------------------------------------------------------

  /** Uma resposta para cada questão da fase, sem repetir, com alternativa da própria questão. */
  private validarRespostas(dto: ResponderFaseDto, questoes: Map<number, { alternativas: Set<number> }>) {
    const vistas = new Set<number>();
    for (const { questaoId, alternativaId } of dto.respostas) {
      const questao = questoes.get(questaoId);
      if (!questao) throw new BadRequestException(`A questão ${questaoId} não é desta fase.`);
      if (vistas.has(questaoId)) throw new BadRequestException(`A questão ${questaoId} foi respondida duas vezes.`);
      if (!questao.alternativas.has(alternativaId)) {
        throw new BadRequestException(`A alternativa ${alternativaId} não é da questão ${questaoId}.`);
      }
      vistas.add(questaoId);
    }
    if (vistas.size !== questoes.size) {
      throw new BadRequestException(`Responda todas as ${questoes.size} questões da fase.`);
    }
  }

  private async idDoPersonagem(usuarioId: number): Promise<number> {
    const id = await this.acesso.personagemDoUsuario(usuarioId);
    if (id === null) throw this.semPersonagem();
    return id;
  }

  private semPersonagem() {
    return new NotFoundException('Você ainda não criou seu personagem.');
  }
}
