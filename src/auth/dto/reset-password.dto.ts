import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { SENHA_FORTE_MENSAGEM, SENHA_FORTE_REGEX } from '../auth.constants.js';

export class ResetPasswordDto {
  @IsString({ message: 'resetToken ausente.' })
  @IsNotEmpty({ message: 'resetToken ausente.' })
  resetToken: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Informe o código de 6 dígitos.' })
  @Matches(/^\d{6}$/, { message: 'Informe o código de 6 dígitos.' })
  codigo: string;

  @IsString({ message: SENHA_FORTE_MENSAGEM })
  @Matches(SENHA_FORTE_REGEX, { message: SENHA_FORTE_MENSAGEM })
  novaSenha: string;
}
