import { ApiProperty } from '@nestjs/swagger';

// Classes só para documentar o formato das respostas no Swagger (/docs).
// O service continua devolvendo objetos simples com esses mesmos campos.

export class UsuarioPublicoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'admin' })
  nome: string;

  @ApiProperty({ example: 'admin@tronus.com' })
  email: string;

  @ApiProperty({ enum: ['aluno', 'professor', 'admin'], example: 'admin' })
  papel: 'aluno' | 'professor' | 'admin';

  @ApiProperty({ type: Number, nullable: true, description: 'Reino do professor; null para aluno e admin', example: null })
  professor_reino_id: number | null;
}

export class SessaoDto {
  @ApiProperty({ description: 'JWT HS256 com sub (id do usuário), papel e exp' })
  access_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: string;

  @ApiProperty({ description: 'Validade do token, em segundos', example: 3600 })
  expires_in: number;

  @ApiProperty({ type: UsuarioPublicoDto })
  usuario: UsuarioPublicoDto;
}

export class ForgotPasswordRespostaDto {
  @ApiProperty({ description: 'Token de uso único para o reset-password' })
  reset_token: string;

  @ApiProperty({ description: 'Validade do reset_token, em segundos', example: 600 })
  expires_in: number;

  @ApiProperty({
    required: false,
    description: 'Código de 6 dígitos. Só vem na resposta com SIMULAR_SMS=true (não há SMS real)',
    example: '482913',
  })
  codigo?: string;
}

export class MensagemDto {
  @ApiProperty({ example: 'Senha redefinida com sucesso.' })
  mensagem: string;
}

export class ErroDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    description: 'Mensagem em português; em erro de validação vem uma lista',
    example: ['Formato de e-mail inválido.'],
  })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ description: 'Momento do erro, ISO 8601 (UTC)', example: '2026-10-08T18:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ description: 'Rota chamada, sem a query string', example: '/auth/register' })
  path: string;
}
