import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { CELULAR_MENSAGEM, somenteDigitos } from '../auth.constants.js';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Celular cadastrado (só alunos)', example: '12999998888' })
  @Transform(({ value }) => (typeof value === 'string' ? somenteDigitos(value) : value))
  @IsString({ message: CELULAR_MENSAGEM })
  @Matches(/^\d{10,11}$/, { message: CELULAR_MENSAGEM })
  celular: string;
}
