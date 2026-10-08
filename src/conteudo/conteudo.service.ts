import { Injectable, NotFoundException } from '@nestjs/common';
import { AcessoService } from '../auth/acesso.service.js';
import type { UsuarioAutenticado } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';

export interface Reino {
  id: number;
  nome: string;
  descricao: string | null;
}

export interface Fase {
  id: number;
  reino_id: number;
  nome: string;
  ordem: number;
}

export interface Alternativa {
  id: number;
  letra: string;
  texto: string;
  correta?: boolean;
}

export interface Questao {
  id: number;
  fase_id: number;
  enunciado: string;
  nivel_dificuldade: string;
  alternativas: Alternativa[];
}

// Conteúdo do jogo: Reinos, Fases e questões. Substitui buscarFasesPorReino()
// e buscarQuestoesPorFase() do js/database.js do front.
@Injectable()
export class ConteudoService {
  constructor(
    private readonly db: DatabaseService,
    private readonly acesso: AcessoService,
  ) {}

  async listarReinos(): Promise<Reino[]> {
    const { rows } = await this.db.query<Reino>('SELECT id, nome, descricao FROM reinos ORDER BY id');
    return rows;
  }

  async listarFases(reinoId: number): Promise<Fase[]> {
    // Uma consulta só: o LEFT JOIN distingue "Reino sem fase" de "Reino que
    // não existe" (404).
    const { rows } = await this.db.query<Fase & { reino_existe: number }>(
      `SELECT r.id AS reino_existe, f.id, f.reino_id, f.nome, f.ordem
         FROM reinos r
         LEFT JOIN fases f ON f.reino_id = r.id
        WHERE r.id = $1
        ORDER BY f.ordem`,
      [reinoId],
    );
    if (rows.length === 0) throw new NotFoundException('Reino não encontrado.');
    return rows.filter((f) => f.id !== null).map(({ id, reino_id, nome, ordem }) => ({ id, reino_id, nome, ordem }));
  }

  /**
   * Questões da fase com as alternativas aninhadas.
   *
   * O campo `correta` só existe na resposta de quem gerencia o Reino da fase
   * (admin ou o professor daquele Reino). Para o aluno ele nem é montado no
   * SQL — não é um campo removido depois, é um campo que nunca sai do banco.
   * Quem decide é o papel do token, nunca um parâmetro do cliente.
   */
  async listarQuestoes(usuario: UsuarioAutenticado, faseId: number): Promise<Questao[]> {
    const { rows: fase } = await this.db.query<{ reino_id: number }>('SELECT reino_id FROM fases WHERE id = $1', [
      faseId,
    ]);
    if (!fase[0]) throw new NotFoundException('Fase não encontrada.');

    const comCorreta = await this.acesso.podeGerenciarReino(usuario, fase[0].reino_id);

    const { rows } = await this.db.query<Questao>(
      `SELECT q.id, q.fase_id, q.enunciado, q.nivel_dificuldade,
              COALESCE(
                json_agg(
                  jsonb_build_object('id', a.id, 'letra', a.letra, 'texto', a.texto)
                  || CASE WHEN $2::boolean THEN jsonb_build_object('correta', a.correta) ELSE '{}'::jsonb END
                  ORDER BY a.letra
                ) FILTER (WHERE a.id IS NOT NULL),
                '[]'
              ) AS alternativas
         FROM questoes q
         LEFT JOIN alternativas a ON a.questao_id = q.id
        WHERE q.fase_id = $1
        GROUP BY q.id
        ORDER BY q.id`,
      [faseId, comCorreta],
    );
    return rows;
  }
}
