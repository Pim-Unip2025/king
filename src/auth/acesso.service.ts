import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { UsuarioAutenticado } from './auth.types.js';

// Regras de acesso que dependem do DADO, não só do papel. O RolesGuard diz
// "professor pode editar questão"; aqui se responde "ESTA questão é do Reino
// deste professor?" e "ESTE personagem é deste aluno?".
//
// Uso nos services das rotas (PIM-17 a PIM-20), antes de ler ou escrever:
//
//   await this.acesso.garantirQuestao(usuario, questaoId);
//   await this.acesso.garantirPersonagem(usuario, personagemId, 'leitura');
//
// O Reino do professor é lido do banco a cada checagem, não do token: se o
// admin trocar o professor de Reino, a regra vale na hora.

export type ModoAcesso = 'leitura' | 'escrita';

const SEM_ACESSO_REINO = 'Você só pode acessar conteúdo do seu Reino.';
const SEM_ACESSO_PERSONAGEM = 'Você só pode acessar os seus próprios dados.';

@Injectable()
export class AcessoService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Professor só no próprio Reino; admin em qualquer um; aluno nunca
   * (aluno não administra conteúdo — a leitura de Reinos/Fases para jogar é
   * rota sem essa checagem).
   */
  async garantirReino(usuario: UsuarioAutenticado, reinoId: number): Promise<void> {
    if (!(await this.podeGerenciarReino(usuario, reinoId))) throw new ForbiddenException(SEM_ACESSO_REINO);
  }

  /**
   * Mesma regra do garantirReino, sem lançar exceção. Para rota que todo
   * mundo pode chamar, mas que devolve mais dado para quem gerencia o Reino
   * (ex.: o campo `correta` das alternativas).
   */
  async podeGerenciarReino(usuario: UsuarioAutenticado, reinoId: number): Promise<boolean> {
    if (usuario.papel === 'admin') return true;
    if (usuario.papel !== 'professor') return false;
    return (await this.reinoDoProfessor(usuario.id)) === reinoId;
  }

  /** Para criar questão numa fase: a fase precisa ser do Reino do professor. */
  async garantirFase(usuario: UsuarioAutenticado, faseId: number): Promise<void> {
    const { rows } = await this.db.query<{ reino_id: number }>('SELECT reino_id FROM fases WHERE id = $1', [faseId]);
    if (!rows[0]) throw new NotFoundException('Fase não encontrada.');
    await this.garantirReino(usuario, rows[0].reino_id);
  }

  /** Para ler, editar ou excluir uma questão (e as alternativas dela). */
  async garantirQuestao(usuario: UsuarioAutenticado, questaoId: number): Promise<void> {
    const { rows } = await this.db.query<{ reino_id: number }>(
      `SELECT f.reino_id FROM questoes q
         JOIN fases f ON f.id = q.fase_id
        WHERE q.id = $1`,
      [questaoId],
    );
    if (!rows[0]) throw new NotFoundException('Questão não encontrada.');
    await this.garantirReino(usuario, rows[0].reino_id);
  }

  /**
   * Dados de um personagem (progresso, respostas, estatísticas).
   *
   *  - aluno: só o próprio personagem, leitura e escrita
   *  - professor/admin: leitura de qualquer um (painel de desempenho);
   *    escrita nunca — progresso é gerado jogando
   *
   * Personagem inexistente e personagem de outro aluno dão o MESMO 403, para
   * não dar para descobrir quais ids existem testando um por um.
   */
  async garantirPersonagem(usuario: UsuarioAutenticado, personagemId: number, modo: ModoAcesso): Promise<void> {
    if (usuario.papel !== 'aluno') {
      if (modo === 'leitura') return;
      throw new ForbiddenException('Progresso só é registrado pelo próprio aluno.');
    }

    const { rows } = await this.db.query<{ usuario_id: number }>(
      'SELECT usuario_id FROM personagens WHERE id = $1',
      [personagemId],
    );
    if (rows[0]?.usuario_id !== usuario.id) throw new ForbiddenException(SEM_ACESSO_PERSONAGEM);
  }

  /**
   * Id do personagem do aluno logado, ou null se ele ainda não criou. Para
   * rotas do tipo /me/progresso, que nem recebem id pela URL — o jeito mais
   * seguro de não vazar dado de outro aluno.
   */
  async personagemDoUsuario(usuarioId: number): Promise<number | null> {
    const { rows } = await this.db.query<{ id: number }>('SELECT id FROM personagens WHERE usuario_id = $1', [usuarioId]);
    return rows[0]?.id ?? null;
  }

  private async reinoDoProfessor(usuarioId: number): Promise<number | null> {
    const { rows } = await this.db.query<{ professor_reino_id: number | null }>(
      `SELECT professor_reino_id FROM usuarios WHERE id = $1 AND papel = 'professor'`,
      [usuarioId],
    );
    return rows[0]?.professor_reino_id ?? null;
  }
}
