import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export class BuscarAlunosQueryDto {
  @ApiPropertyOptional({
    description: 'Parte do nome de usuário do aluno; ignora maiúsculas/minúsculas. Vazio lista todos.',
    example: 'joao',
    maxLength: 60,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'nome deve ser texto.' })
  @MaxLength(60, { message: 'nome deve ter no máximo 60 caracteres.' })
  nome?: string;
}

// ---------------------------------------------------------------------------
// Saída (só para o Swagger)
// ---------------------------------------------------------------------------

export class EstatisticaFaseDto {
  @ApiProperty({ example: 'Python' })
  reino: string;

  @ApiProperty({ example: 1 })
  fase_id: number;

  @ApiProperty({ example: 'Fase 1' })
  fase: string;

  @ApiProperty({ description: 'Questões respondidas na fase, somando todas as tentativas', example: 10 })
  tentativas: number;

  @ApiProperty({ example: 7 })
  acertos: number;

  @ApiProperty({ description: 'Percentual, 1 casa decimal. 0 quando não há tentativa', example: 70 })
  taxa_acerto: number;

  @ApiProperty({ description: 'Melhor resultado na fase, 0 a 3', example: 3 })
  estrelas: number;
}

export class ResumoGeralDto {
  @ApiProperty({ example: 20 })
  total_respostas: number;

  @ApiProperty({ example: 15 })
  total_acertos: number;

  @ApiProperty({ description: 'Percentual, 1 casa decimal', example: 75 })
  taxa_geral: number;

  @ApiProperty({ example: 8 })
  total_estrelas: number;

  @ApiProperty({ description: 'Fases com ao menos 1 estrela', example: 3 })
  fases_iniciadas: number;

  @ApiProperty({ description: 'Fases com 3 estrelas', example: 2 })
  fases_completas: number;
}

export class AlunoBuscaDto {
  @ApiProperty({ description: 'Id do usuário — é o :id da rota de desempenho', example: 7 })
  usuario_id: number;

  @ApiProperty({ example: 'joao_silva' })
  usuario_nome: string;

  @ApiProperty({ type: Number, nullable: true, description: 'null se o aluno ainda não criou personagem', example: 3 })
  personagem_id: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Sir Lancelot' })
  personagem_nome: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Cavaleiro' })
  titulo_atual: string | null;

  @ApiProperty({ example: 17 })
  total_estrelas: number;
}
