// Avatares que o front oferece (character.html / js/character_db.js). O
// avatar é o caminho da imagem no front; a API só aceita os da lista, para
// ninguém gravar uma URL qualquer que depois é renderizada nas telas.
export const AVATARES = {
  male: ['img/masc1.png', 'img/masc2.png', 'img/masc3.png'],
  female: ['img/fem1.png', 'img/fem2.png', 'img/fem3.png'],
} as const;

export type Genero = keyof typeof AVATARES;
export const GENEROS = Object.keys(AVATARES) as Genero[];

/**
 * Estrelas de uma tentativa, pela fração de acertos. Mesma régua do quiz do
 * front (trilha.html), que em 5 questões dá: 4-5 acertos = 3, 3 = 2, 1-2 = 1,
 * 0 = 0. Em fração, para continuar valendo se a fase tiver outro número de
 * questões.
 *
 * Isto é a nota DA TENTATIVA. Melhor nota, total de estrelas e título NÃO
 * são calculados aqui: ficam com sp_registrar_progresso e com a trigger
 * trg_progresso_atualiza_personagem, no banco.
 */
export function estrelasDaTentativa(acertos: number, total: number): 0 | 1 | 2 | 3 {
  if (total <= 0 || acertos <= 0) return 0;
  const fracao = acertos / total;
  if (fracao >= 0.8) return 3;
  if (fracao >= 0.6) return 2;
  return 1;
}
