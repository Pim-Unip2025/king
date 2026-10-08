import { HttpStatus } from '@nestjs/common';

// Tradução dos erros do PostgreSQL para HTTP. A mensagem crua do banco cita
// nome de tabela, constraint e às vezes o valor gravado ("Key (email)=(...)"),
// então ela NUNCA vai para o cliente — com uma exceção: o RAISE das nossas
// próprias triggers, que já foi escrito em português para o usuário.

export interface ErroPostgres {
  code: string;
  message: string;
  constraint?: string;
  routine?: string;
  severity?: string;
}

/** Erro que veio do driver pg (tem SQLSTATE de 5 caracteres e severity). */
export function ehErroPostgres(erro: unknown): erro is ErroPostgres {
  const e = erro as Partial<ErroPostgres> | null;
  return (
    typeof e === 'object' && e !== null && typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && typeof e.severity === 'string'
  );
}

// Mensagens por constraint (nomes de 01_schema.sql). O que não estiver aqui
// cai na mensagem genérica do código.
const POR_CONSTRAINT: Record<string, string> = {
  usuarios_nome_key: 'Nome de usuário já cadastrado.',
  usuarios_email_key: 'E-mail já cadastrado.',
  personagens_usuario_id_key: 'Este usuário já tem um personagem.',
  uq_fases_reino_ordem: 'Já existe uma fase nessa posição do Reino.',
  uq_alternativas_questao_letra: 'Letra de alternativa repetida na mesma questão.',
  uq_progresso_personagem_fase: 'Progresso já registrado para esta fase.',
  ck_usuarios_papel: 'Papel deve ser aluno, professor ou admin.',
  ck_usuarios_reino_do_professor: 'Professor precisa ter um Reino; aluno e admin não podem ter Reino.',
  ck_personagens_titulo: 'Título inválido.',
  ck_personagens_estrelas: 'Total de estrelas não pode ser negativo.',
  ck_fases_ordem: 'A ordem da fase deve ser de 1 a 3.',
  ck_progresso_estrelas: 'Estrelas devem estar entre 0 e 3.',
  ck_questoes_nivel: 'Nível deve ser Fácil, Médio ou Difícil.',
  ck_alternativas_letra: 'Alternativa deve ter letra de A a E.',
  fk_usuarios_reino: 'Reino não encontrado.',
  fk_personagens_usuario: 'Usuário não encontrado.',
  fk_fases_reino: 'Reino não encontrado.',
  fk_questoes_fase: 'Fase não encontrada.',
  fk_alternativas_questao: 'Questão não encontrada.',
  fk_progresso_personagem: 'Personagem não encontrado.',
  fk_progresso_fase: 'Fase não encontrada.',
  fk_respostas_personagem: 'Personagem não encontrado.',
  fk_respostas_questao: 'Questão não encontrada.',
  fk_respostas_fase: 'Fase não encontrada.',
};

/**
 * Status e mensagem segura para o cliente, ou null se o erro não é "culpa do
 * cliente" (aí vira 500 genérico).
 */
export function traduzirErroPostgres(erro: ErroPostgres): { status: HttpStatus; mensagem: string } | null {
  const daConstraint = erro.constraint ? POR_CONSTRAINT[erro.constraint] : undefined;

  switch (erro.code) {
    case '23505': // unique_violation
      return { status: HttpStatus.CONFLICT, mensagem: daConstraint ?? 'Registro já existe.' };

    case '23503': // foreign_key_violation (inserir com id que não existe, ou apagar algo em uso)
      return { status: HttpStatus.BAD_REQUEST, mensagem: daConstraint ?? 'Registro relacionado não existe ou está em uso.' };

    case '23514': // check_violation
      // Sem constraint = RAISE ... USING ERRCODE = 'check_violation' de uma
      // trigger nossa (ex.: trg_valida_alternativa_correta). Essa mensagem
      // foi escrita para o usuário e pode ir para o cliente.
      if (!erro.constraint) return { status: HttpStatus.BAD_REQUEST, mensagem: erro.message };
      return { status: HttpStatus.BAD_REQUEST, mensagem: daConstraint ?? 'Valor fora do permitido.' };

    case '23502': // not_null_violation
      return { status: HttpStatus.BAD_REQUEST, mensagem: 'Campo obrigatório não informado.' };

    case '22001': // string_data_right_truncation (texto maior que a coluna)
      return { status: HttpStatus.BAD_REQUEST, mensagem: 'Texto maior que o permitido.' };

    case '22P02': // invalid_text_representation (ex.: "abc" num INTEGER)
    case '22003': // numeric_value_out_of_range
      return { status: HttpStatus.BAD_REQUEST, mensagem: 'Valor em formato inválido.' };

    default:
      return null;
  }
}
