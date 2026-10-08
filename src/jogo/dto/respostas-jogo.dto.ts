import { ApiProperty } from '@nestjs/swagger';

// Classes só para documentar as respostas no Swagger (/docs).

export class PersonagemDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Arthur' })
  nome: string;

  @ApiProperty({ enum: ['male', 'female'], example: 'male' })
  genero: string;

  @ApiProperty({ example: 'img/masc1.png' })
  avatar: string;

  @ApiProperty({ enum: ['Plebeu', 'Cavaleiro', 'Duque', 'Rei'], description: 'Calculado pelo banco (trigger)', example: 'Plebeu' })
  titulo_atual: string;

  @ApiProperty({ description: 'Soma da melhor nota de cada fase. Calculado pelo banco (trigger)', example: 0 })
  total_estrelas: number;
}

export class ProgressoFaseDto {
  @ApiProperty({ example: 1 })
  reino_id: number;

  @ApiProperty({ example: 'Python' })
  reino_nome: string;

  @ApiProperty({ example: 1 })
  fase_id: number;

  @ApiProperty({ example: 'Fase 1' })
  fase_nome: string;

  @ApiProperty({ example: 1 })
  ordem: number;

  @ApiProperty({ description: 'Melhor nota na fase; 0 se nunca jogou', example: 2 })
  estrelas: number;

  @ApiProperty({ description: 'false se a fase nunca foi jogada', example: true })
  jogada: boolean;
}

export class CorrecaoDto {
  @ApiProperty({ example: 1 })
  questao_id: number;

  @ApiProperty({ example: 3 })
  alternativa_escolhida_id: number;

  @ApiProperty({ example: 4, description: 'Só aparece depois de responder, para a tela mostrar a resposta certa' })
  alternativa_correta_id: number;

  @ApiProperty({ example: false })
  acertou: boolean;
}

export class ResultadoFaseDto {
  @ApiProperty({ example: 1 })
  fase_id: number;

  @ApiProperty({ example: 4 })
  acertos: number;

  @ApiProperty({ example: 5 })
  total: number;

  @ApiProperty({ description: 'Estrelas DESTA tentativa', example: 3 })
  estrelas: number;

  @ApiProperty({ description: 'Melhor nota já conquistada na fase (nunca diminui)', example: 3 })
  melhor_estrelas: number;

  @ApiProperty({ type: PersonagemDto, description: 'Personagem já com título e total atualizados pelo banco' })
  personagem: PersonagemDto;

  @ApiProperty({ type: [CorrecaoDto] })
  correcao: CorrecaoDto[];
}
