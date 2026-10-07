import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { CELULAR_MENSAGEM, somenteDigitos } from '../auth.constants';

export class ForgotPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? somenteDigitos(value) : value))
  @IsString({ message: CELULAR_MENSAGEM })
  @Matches(/^\d{10,11}$/, { message: CELULAR_MENSAGEM })
  celular: string;
}
