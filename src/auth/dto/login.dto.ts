import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Nome de usuário ou e-mail', example: 'admin' })
  // Nome de usuário OU e-mail, no mesmo campo — igual ao login atual do front.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Informe o usuário ou e-mail.' })
  @IsNotEmpty({ message: 'Informe o usuário ou e-mail.' })
  identificador: string;

  @ApiProperty({ example: 'Tronus@adm1', format: 'password' })
  @IsString({ message: 'Informe a senha.' })
  @IsNotEmpty({ message: 'Informe a senha.' })
  senha: string;
}
