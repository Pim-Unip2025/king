import { Injectable, NotFoundException } from '@nestjs/common';
import { AcessoService } from '../auth/acesso.service.js';
import type { UsuarioAutenticado } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';

export interface EstatisticaFase {
  reino: string;
  fase_id: number;
  fase: string;
  tentativas: number;
  acertos: number;
  taxa_acerto: number;
  estrelas: number;
}

export interface ResumoGeral {
  total_respostas: number;
  total_acertos: number;
  taxa_geral: number;
  total_estrelas: number;
  fases_iniciadas: number;
  fases_completas: number;
}

export interface AlunoBusca {
  usuario_id: number;
  usuario_nome: string;
  personagem_id: number | null;
  personagem_nome: string | null;
  titulo_atual: string | null;
  total_estrelas: number;
}

// As agregações já existem como funções no banco (03_procedures.sql). Aqui só
// chama e converte os tipos: o pg devolve BIGINT e NUMERIC como string, então
// os casts ::int / ::float8 ficam no SELECT para o JSON sair com número.
const COLUNAS_ESTATISTICA = `reino, fase_id, fase, tentativas::int, acertos::int,
                             taxa_acerto::float8 AS taxa_acerto, estrelas::int`;

// Desempenho: dashboard do aluno e consulta do painel do professor.
// Substitui buscarEstatisticas(), buscarResumoGeral(), buscarAlunosPorNome()
// e buscarDesempenhoAluno() do js/database.js do front.
@Injectable()
export class DesempenhoService {
  constructor(
    private readonly db: DatabaseService,
    private readonly acesso: AcessoService,
  ) {}

  async minhasEstatisticas(usuarioId: number): Promise<EstatisticaFase[]> {
    const personagemId = await this.meuPersonagem(usuarioId);
    const { rows } = await this.db.query<EstatisticaFase>(
      `SELECT ${COLUNAS_ESTATISTICA} FROM fn_estatisticas_personagem($1)`,
      [personagemId],
    );
    return rows;
  }

  async meuResumo(usuarioId: number): Promise<ResumoGeral> {
    const personagemId = await this.meuPersonagem(usuarioId);
    const { rows } = await this.db.query<ResumoGeral>(
      `SELECT total_respostas::int, total_acertos::int, taxa_geral::float8 AS taxa_geral,
              total_estrelas, fases_iniciadas::int, fases_completas::int
         FROM fn_resumo_geral($1)`,
      [personagemId],
    );
    return rows[0];
  }

  async buscarAlunos(nome: string | undefined): Promise<AlunoBusca[]> {
    // fn_buscar_alunos monta o padrão com '%' || nome || '%'. Escapa % e _
    // para "joao_" procurar o texto "joao_" e não "joao + qualquer letra".
    const texto = (nome ?? '').replace(/[\\%_]/g, (c) => `\\${c}`);
    const { rows } = await this.db.query<AlunoBusca>('SELECT * FROM fn_buscar_alunos($1)', [texto]);
    return rows;
  }

  /**
   * Desempenho por fase de um aluno, pelo id do USUÁRIO (o que a busca
   * devolve). Professor e admin leem qualquer aluno — a regra fica no
   * AcessoService, a mesma que vale para as rotas de progresso.
   */
  async desempenhoDoAluno(usuario: UsuarioAutenticado, alunoId: number): Promise<EstatisticaFase[]> {
    const { rows: aluno } = await this.db.query<{ personagem_id: number | null }>(
      `SELECT p.id AS personagem_id
         FROM usuarios u
         LEFT JOIN personagens p ON p.usuario_id = u.id
        WHERE u.id = $1 AND u.papel = 'aluno'`,
      [alunoId],
    );
    if (!aluno[0]) throw new NotFoundException('Aluno não encontrado.');
    if (aluno[0].personagem_id === null) throw new NotFoundException('Este aluno ainda não criou personagem.');

    await this.acesso.garantirPersonagem(usuario, aluno[0].personagem_id, 'leitura');

    const { rows } = await this.db.query<EstatisticaFase>(
      `SELECT ${COLUNAS_ESTATISTICA} FROM fn_desempenho_aluno($1)`,
      [aluno[0].personagem_id],
    );
    return rows;
  }

  private async meuPersonagem(usuarioId: number): Promise<number> {
    const id = await this.acesso.personagemDoUsuario(usuarioId);
    if (id === null) throw new NotFoundException('Você ainda não criou seu personagem.');
    return id;
  }
}
