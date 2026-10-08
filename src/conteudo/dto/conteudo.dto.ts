import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Classes só para documentar o formato das respostas no Swagger (/docs).

export class ReinoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Python' })
  nome: string;

  @ApiProperty({ type: String, nullable: true, example: 'Linguagem de programação Python' })
  descricao: string | null;
}

export class FaseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  reino_id: number;

  @ApiProperty({ example: 'Fase 1' })
  nome: string;

  @ApiProperty({ description: 'Posição da fase no Reino, de 1 a 3', example: 1 })
  ordem: number;
}

export class AlternativaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: ['A', 'B', 'C', 'D', 'E'], example: 'A' })
  letra: string;

  @ApiProperty({ example: 'print("Olá")' })
  texto: string;

  @ApiPropertyOptional({
    description:
      'Só vem para o admin e para o professor do Reino da fase. Para aluno (e professor de outro Reino) o campo NÃO existe na resposta — a correção é feita no servidor.',
    example: true,
  })
  correta?: boolean;
}

export class QuestaoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  fase_id: number;

  @ApiProperty({ example: 'Qual comando exibe texto na tela em Python?' })
  enunciado: string;

  @ApiProperty({ enum: ['Fácil', 'Médio', 'Difícil'], example: 'Fácil' })
  nivel_dificuldade: string;

  @ApiProperty({ type: [AlternativaDto], description: 'Ordenadas pela letra' })
  alternativas: AlternativaDto[];
}
