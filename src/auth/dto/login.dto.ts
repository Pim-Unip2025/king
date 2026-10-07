import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  // Nome de usuário OU e-mail, no mesmo campo — igual ao login atual do front.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Informe o usuário ou e-mail.' })
  @IsNotEmpty({ message: 'Informe o usuário ou e-mail.' })
  identificador: string;

  @IsString({ message: 'Informe a senha.' })
  @IsNotEmpty({ message: 'Informe a senha.' })
  senha: string;
}
