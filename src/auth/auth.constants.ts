// Custo do bcrypt. TEM que ser o mesmo dos seeds (db/02b_seed_usuarios.sql no
// repo Tronus): os hashes de admin e prof_python foram gerados com custo 10.
// O custo fica gravado no próprio hash ($2b$10$...), então o login confere
// qualquer custo — mas hashes novos precisam seguir o padrão do projeto.
export const BCRYPT_COST = 10;

// bcrypt só considera os primeiros 72 bytes da senha e ignora o resto em
// silêncio. Recusamos senha maior para ninguém achar que a senha longa vale.
export const BCRYPT_MAX_BYTES = 72;

// Senha forte: 8+ caracteres, com minúscula, maiúscula, número e símbolo.
// Mesmo padrão das senhas dos seeds (Tronus@adm1, Python@prof1).
export const SENHA_FORTE_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const SENHA_FORTE_MENSAGEM =
  'A senha deve ter no mínimo 8 caracteres, com letra maiúscula, letra minúscula, número e símbolo.';

// Celular brasileiro: DDD + número, 10 ou 11 dígitos (igual ao front atual).
export const CELULAR_MENSAGEM = 'Celular inválido. Use DDD + número (10 ou 11 dígitos).';

// Redefinição de senha: validade do código/resetToken, em segundos.
export const RESET_TTL_SEGUNDOS = 10 * 60;

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}
