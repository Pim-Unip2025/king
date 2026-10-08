import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PAPEIS } from '../../auth/auth.types.js';
import { UsuarioPublicoDto } from '../../auth/dto/respostas.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
export const NIVEIS = ['Fácil', 'Médio', 'Difícil'] as const;

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export class NovaAlternativaDto {
  @ApiProperty({ enum: LETRAS, example: 'A' })
  @IsIn(LETRAS, { message: 'letra deve ser de A a E.' })
  letra: (typeof LETRAS)[number];

  @ApiProperty({ example: 'print("Olá")', maxLength: 500 })
  @Transform(trim)
  @IsString({ message: 'Informe o texto da alternativa.' })
  @IsNotEmpty({ message: 'Informe o texto da alternativa.' })
  @MaxLength(500, { message: 'O texto da alternativa deve ter no máximo 500 caracteres.' })
  texto: string;

  @ApiProperty({ example: true })
  @IsBoolean({ message: 'correta deve ser true ou false.' })
  correta: boolean;
}

export class CriarQuestaoDto {
  @ApiProperty({ example: 'Qual comando exibe texto na tela em Python?', maxLength: 2000 })
  @Transform(trim)
  @IsString({ message: 'Informe o enunciado.' })
  @IsNotEmpty({ message: 'Informe o enunciado.' })
  @MaxLength(2000, { message: 'O enunciado deve ter no máximo 2000 caracteres.' })
  enunciado: string;

  @ApiProperty({ enum: NIVEIS, example: 'Fácil' })
  @IsIn(NIVEIS, { message: `nivel_dificuldade deve ser um destes: ${NIVEIS.join(', ')}.` })
  nivel_dificuldade: (typeof NIVEIS)[number];

  @ApiProperty({
    type: [NovaAlternativaDto],
    description:
      'De 2 a 5 alternativas, letras sem repetir. Exatamente UMA correta — quem garante é a trigger do banco; zero ou duas devolve 400.',
  })
  @IsArray({ message: 'alternativas deve ser uma lista.' })
  @ArrayMinSize(2, { message: 'A questão precisa de pelo menos 2 alternativas.' })
  @ArrayMaxSize(5, { message: 'A questão pode ter no máximo 5 alternativas (A a E).' })
  @ArrayUnique((a: NovaAlternativaDto) => a?.letra, { message: 'Letra de alternativa repetida.' })
  @ValidateNested({ each: true })
  @Type(() => NovaAlternativaDto)
  alternativas: NovaAlternativaDto[];
}

export class ListarUsuariosQueryDto {
  @ApiPropertyOptional({ enum: PAPEIS, description: 'Filtra por papel' })
  @IsOptional()
  @IsIn(PAPEIS, { message: `papel deve ser um destes: ${PAPEIS.join(', ')}.` })
  papel?: (typeof PAPEIS)[number];
}

export class VincularReinoDto {
  @ApiProperty({ description: 'Reino que o professor passa a administrar', example: 2 })
  @IsInt({ message: 'reino_id deve ser um número inteiro.' })
  @IsPositive({ message: 'reino_id deve ser positivo.' })
  reino_id: number;
}

// ---------------------------------------------------------------------------
// Saída (só para o Swagger)
// ---------------------------------------------------------------------------

export class QuestaoExcluidaDto {
  @ApiProperty({ example: 'Questão excluída.' })
  mensagem: string;

  @ApiProperty({ example: 12 })
  questao_id: number;

  @ApiProperty({ description: 'Respostas de alunos apagadas junto (CASCADE)', example: 8 })
  respostas_apagadas: number;
}

export class EstatisticasAdminDto {
  @ApiProperty({ example: 42 })
  usuarios: number;

  @ApiProperty({ example: 38 })
  alunos: number;

  @ApiProperty({ example: 3 })
  professores: number;

  @ApiProperty({ example: 1 })
  admins: number;

  @ApiProperty({ example: 30 })
  personagens: number;

  @ApiProperty({ example: 15 })
  questoes: number;

  @ApiProperty({ example: 640 })
  respostas: number;

  @ApiProperty({ description: 'Percentual de acerto de todas as respostas, 1 casa decimal', example: 71.3 })
  taxa_acerto: number;

  @ApiProperty({
    description: 'Quantos personagens em cada título',
    example: { Plebeu: 20, Cavaleiro: 7, Duque: 2, Rei: 1 },
  })
  personagens_por_titulo: Record<string, number>;
}

export class UsuarioAdminDto extends UsuarioPublicoDto {
  @ApiProperty({ type: String, nullable: true, example: 'Python' })
  reino_nome: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'null se não tem personagem', example: 5 })
  personagem_id: number | null;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  criado_em: string;
}

export class ApagadosDto {
  @ApiProperty({ example: 1 })
  usuarios: number;

  @ApiProperty({ example: 1 })
  personagens: number;

  @ApiProperty({ example: 4 })
  progresso_fases: number;

  @ApiProperty({ example: 20 })
  respostas_usuario: number;
}

export class UsuarioExcluidoDto {
  @ApiProperty({ example: 'Usuário excluído. Esta ação não pode ser desfeita.' })
  mensagem: string;

  @ApiProperty({ example: 7 })
  usuario_id: number;

  @ApiProperty({ type: ApagadosDto, description: 'Registros apagados, incluindo os levados pelo CASCADE' })
  apagados: ApagadosDto;
}
