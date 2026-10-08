import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';
import { AVATARES, GENEROS, type Genero } from '../jogo.constants.js';

const TODOS_AVATARES = Object.values(AVATARES).flat();

export class CriarPersonagemDto {
  @ApiProperty({ description: 'Nome do personagem, 1 a 60 caracteres', example: 'Arthur', maxLength: 60 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Informe o nome do personagem.' })
  @Length(1, 60, { message: 'O nome do personagem deve ter entre 1 e 60 caracteres.' })
  nome: string;

  @ApiProperty({ enum: GENEROS, example: 'male' })
  @IsIn(GENEROS, { message: `Gênero inválido. Use: ${GENEROS.join(', ')}.` })
  genero: Genero;

  @ApiProperty({ enum: TODOS_AVATARES, description: 'Precisa ser um avatar do gênero escolhido', example: 'img/masc1.png' })
  @IsIn(TODOS_AVATARES, { message: 'Avatar inválido.' })
  avatar: string;
}
