import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { CELULAR_MENSAGEM, SENHA_FORTE_MENSAGEM, SENHA_FORTE_REGEX, somenteDigitos } from '../auth.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @Transform(trim)
  @IsString({ message: 'Informe o nome de usuário.' })
  @Length(3, 60, { message: 'O nome de usuário deve ter entre 3 e 60 caracteres.' })
  // Sem "@": o login aceita nome OU e-mail no mesmo campo, então um nome com
  // "@" poderia colidir com o e-mail de outra pessoa.
  @Matches(/^[^@\s]+$/, { message: 'O nome de usuário não pode ter espaços nem "@".' })
  nome: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString({ message: 'Informe o e-mail.' })
  @MaxLength(120, { message: 'E-mail muito longo.' })
  @IsEmail({}, { message: 'Formato de e-mail inválido.' })
  email: string;

  // Aceita "(12) 99999-9999" e guarda só os dígitos.
  @Transform(({ value }) => (typeof value === 'string' ? somenteDigitos(value) : value))
  @IsString({ message: CELULAR_MENSAGEM })
  @Matches(/^\d{10,11}$/, { message: CELULAR_MENSAGEM })
  celular: string;

  @IsString({ message: SENHA_FORTE_MENSAGEM })
  @Matches(SENHA_FORTE_REGEX, { message: SENHA_FORTE_MENSAGEM })
  senha: string;
}
