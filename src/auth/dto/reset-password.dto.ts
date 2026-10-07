import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { SENHA_FORTE_MENSAGEM, SENHA_FORTE_REGEX } from '../auth.constants.js';

export class ResetPasswordDto {
  @ApiProperty({ description: 'reset_token devolvido pelo forgot-password' })
  @IsString({ message: 'resetToken ausente.' })
  @IsNotEmpty({ message: 'resetToken ausente.' })
  resetToken: string;

  @ApiProperty({ description: 'Código de 6 dígitos', example: '482913' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Informe o código de 6 dígitos.' })
  @Matches(/^\d{6}$/, { message: 'Informe o código de 6 dígitos.' })
  codigo: string;

  @ApiProperty({ description: 'Mesma regra de senha forte do cadastro', example: 'NovaSenha@1', format: 'password' })
  @IsString({ message: SENHA_FORTE_MENSAGEM })
  @Matches(SENHA_FORTE_REGEX, { message: SENHA_FORTE_MENSAGEM })
  novaSenha: string;
}
