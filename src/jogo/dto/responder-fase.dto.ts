import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsPositive, ValidateNested } from 'class-validator';

export class RespostaDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'questaoId deve ser um número inteiro.' })
  @IsPositive({ message: 'questaoId inválido.' })
  questaoId: number;

  @ApiProperty({ description: 'Alternativa escolhida pelo aluno', example: 3 })
  @IsInt({ message: 'alternativaId deve ser um número inteiro.' })
  @IsPositive({ message: 'alternativaId inválido.' })
  alternativaId: number;
}

export class ResponderFaseDto {
  @ApiProperty({ type: [RespostaDto], description: 'Uma resposta para CADA questão da fase' })
  @IsArray({ message: 'Envie as respostas em uma lista.' })
  @ArrayMinSize(1, { message: 'Envie ao menos uma resposta.' })
  @ArrayMaxSize(100, { message: 'Respostas demais.' })
  @ValidateNested({ each: true })
  @Type(() => RespostaDto)
  respostas: RespostaDto[];
}
