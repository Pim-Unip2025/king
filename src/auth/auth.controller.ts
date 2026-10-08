import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { Public, UsuarioAtual } from './auth.decorators.js';
import type { UsuarioAutenticado } from './auth.types.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ErroDto, ForgotPasswordRespostaDto, MensagemDto, SessaoDto, UsuarioPublicoDto } from './dto/respostas.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Cadastra um aluno', description: 'Já devolve a sessão (token), como o login.' })
  @ApiCreatedResponse({ type: SessaoDto })
  @ApiBadRequestResponse({ type: ErroDto, description: 'E-mail, celular ou senha fora do formato' })
  @ApiConflictResponse({ type: ErroDto, description: 'Nome de usuário, e-mail ou celular já cadastrado' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login por nome de usuário ou e-mail' })
  @ApiOkResponse({ type: SessaoDto })
  @ApiUnauthorizedResponse({ type: ErroDto, description: 'Usuário ou senha incorretos (mesma mensagem nos dois casos)' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Esqueci a senha, etapa 1: gera o código',
    description: 'Só para alunos. Professor e admin têm a senha redefinida pelo administrador.',
  })
  @ApiOkResponse({ type: ForgotPasswordRespostaDto })
  @ApiNotFoundResponse({ type: ErroDto, description: 'Nenhuma conta com esse celular' })
  @ApiForbiddenResponse({ type: ErroDto, description: 'Celular de professor ou admin' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Esqueci a senha, etapa 2: troca a senha', description: 'O reset_token vale uma vez só.' })
  @ApiOkResponse({ type: MensagemDto })
  @ApiBadRequestResponse({ type: ErroDto, description: 'Código inválido ou expirado, ou senha fraca' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário logado' })
  @ApiOkResponse({ type: UsuarioPublicoDto })
  @ApiUnauthorizedResponse({ type: ErroDto, description: 'Token ausente, inválido ou expirado' })
  me(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.auth.me(usuario.id);
  }
}
