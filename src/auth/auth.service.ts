import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { BCRYPT_COST, BCRYPT_MAX_BYTES, RESET_TTL_SEGUNDOS } from './auth.constants.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { AccessTokenPayload, Papel, UsuarioPublico } from './auth.types.js';

// Colunas que podem sair da API. senha_hash NUNCA entra nesta lista.
const COLUNAS_PUBLICAS = 'id, nome, email, papel, professor_reino_id';

type UsuarioComHash = UsuarioPublico & { senha_hash: string };

// Hash de uma senha qualquer, usado quando o usuário não existe: o login roda
// o bcrypt do mesmo jeito, para o tempo de resposta não denunciar quais
// usuários existem.
const HASH_FICTICIO = bcrypt.hashSync('usuario-inexistente', BCRYPT_COST);

@Injectable()
export class AuthService {
  // Log de autenticação: só id, papel e o motivo. NUNCA senha, hash, token,
  // código de redefinição ou o identificador digitado no login (gente digita
  // a senha no campo de usuário sem querer).
  private readonly logger = new Logger('Auth');
  private readonly expiresIn: number;
  private readonly jwtSecret: string;
  private readonly simularSms: boolean;

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
    this.expiresIn = Number(config.get('JWT_EXPIRES_IN') ?? 3600);
    this.simularSms = config.get('SIMULAR_SMS') === 'true';
  }

  // --------------------------------------------------------------------------
  // POST /auth/register
  // --------------------------------------------------------------------------
  async register(dto: RegisterDto) {
    this.garantirTamanhoBcrypt(dto.senha);

    // Checagem antecipada só para devolver a mensagem certa. A garantia real
    // de nome/e-mail é o UNIQUE do banco (tratado no catch abaixo).
    const { rows: existentes } = await this.db.query<{ nome: string; email: string; celular: string }>(
      `SELECT nome, email, celular FROM usuarios
        WHERE nome = $1 OR lower(email) = $2 OR regexp_replace(celular, '\\D', '', 'g') = $3`,
      [dto.nome, dto.email, dto.celular],
    );
    if (existentes.some((u) => u.nome === dto.nome)) {
      throw new ConflictException('Nome de usuário já cadastrado.');
    }
    if (existentes.some((u) => u.email.toLowerCase() === dto.email)) {
      throw new ConflictException('E-mail já cadastrado.');
    }
    // O banco não tem UNIQUE em celular, mas a redefinição de senha localiza a
    // conta pelo celular — dois usuários com o mesmo número quebrariam isso.
    if (existentes.length > 0) {
      throw new ConflictException('Celular já cadastrado.');
    }

    const senhaHash = await bcrypt.hash(dto.senha, BCRYPT_COST);

    let usuario: UsuarioPublico;
    try {
      const { rows } = await this.db.query<UsuarioPublico>(
        `INSERT INTO usuarios (nome, email, celular, senha_hash, papel)
         VALUES ($1, $2, $3, $4, 'aluno')
         RETURNING ${COLUNAS_PUBLICAS}`,
        [dto.nome, dto.email, dto.celular, senhaHash],
      );
      usuario = rows[0];
      this.logger.log(`Cadastro: usuario=${usuario.id} papel=aluno`);
    } catch (erro) {
      // Duas requisições simultâneas passam pela checagem acima; o UNIQUE pega.
      if ((erro as { code?: string }).code === '23505') {
        throw new ConflictException('Nome de usuário ou e-mail já cadastrado.');
      }
      throw erro;
    }

    return this.sessao(usuario);
  }

  // --------------------------------------------------------------------------
  // POST /auth/login
  // --------------------------------------------------------------------------
  async login(dto: LoginDto) {
    const { rows } = await this.db.query<UsuarioComHash>(
      `SELECT ${COLUNAS_PUBLICAS}, senha_hash FROM usuarios
        WHERE nome = $1 OR lower(email) = lower($1)
        ORDER BY (nome = $1) DESC
        LIMIT 1`,
      [dto.identificador],
    );
    const encontrado = rows[0];

    const senhaConfere = await bcrypt.compare(dto.senha, encontrado?.senha_hash ?? HASH_FICTICIO);
    if (!encontrado || !senhaConfere) {
      // Mesma mensagem para "não existe" e "senha errada", de propósito.
      this.logger.warn(`Login recusado: ${encontrado ? `usuario=${encontrado.id} senha incorreta` : 'usuário inexistente'}`);
      throw new UnauthorizedException('Usuário ou senha incorretos.');
    }

    const { senha_hash: _descartado, ...usuario } = encontrado;
    this.logger.log(`Login: usuario=${usuario.id} papel=${usuario.papel}`);
    return this.sessao(usuario);
  }

  // --------------------------------------------------------------------------
  // GET /auth/me
  // --------------------------------------------------------------------------
  async me(usuarioId: number): Promise<UsuarioPublico> {
    const { rows } = await this.db.query<UsuarioPublico>(
      `SELECT ${COLUNAS_PUBLICAS} FROM usuarios WHERE id = $1`,
      [usuarioId],
    );
    if (!rows[0]) throw new UnauthorizedException('Usuário não existe mais.');
    return rows[0];
  }

  // --------------------------------------------------------------------------
  // POST /auth/forgot-password — etapa 1: celular -> código + resetToken
  //
  // Sem banco de códigos: o resetToken é um JWT assinado com
  // JWT_SECRET + senha_hash atual. Quando a senha muda, o hash muda e o token
  // morre sozinho — uso único sem tabela nova. O código não vai no token em
  // claro, só um HMAC dele (o cliente consegue ler o payload de um JWT).
  // --------------------------------------------------------------------------
  async forgotPassword(dto: ForgotPasswordDto) {
    const { rows } = await this.db.query<{ id: number; papel: Papel; senha_hash: string }>(
      `SELECT id, papel, senha_hash FROM usuarios
        WHERE regexp_replace(celular, '\\D', '', 'g') = $1
        LIMIT 2`,
      [dto.celular],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Nenhuma conta encontrada com esse número.');
    }
    if (rows.length > 1) {
      throw new ConflictException('Este celular está em mais de uma conta. Procure o administrador.');
    }
    const usuario = rows[0];

    // Enquanto não houver SMS de verdade, o código volta na resposta
    // (SIMULAR_SMS). Liberar isso para admin/professor deixaria qualquer um
    // assumir essas contas sabendo o celular — e o do admin é 00000000000.
    if (usuario.papel !== 'aluno') {
      this.logger.warn(`Redefinição de senha recusada: usuario=${usuario.id} papel=${usuario.papel}`);
      throw new ForbiddenException('A senha de professor e administrador é redefinida pelo administrador.');
    }

    const codigo = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const resetToken = await this.jwt.signAsync(
      { sub: String(usuario.id), ch: this.hmacCodigo(usuario.id, codigo) },
      { secret: this.segredoReset(usuario.senha_hash), expiresIn: RESET_TTL_SEGUNDOS },
    );

    this.logger.log(`Código de redefinição gerado: usuario=${usuario.id}`);
    return {
      reset_token: resetToken,
      expires_in: RESET_TTL_SEGUNDOS,
      // Simulação do SMS, igual à tela atual que mostra o código.
      ...(this.simularSms ? { codigo } : {}),
    };
  }

  // --------------------------------------------------------------------------
  // POST /auth/reset-password — etapa 2: resetToken + código + nova senha
  // --------------------------------------------------------------------------
  async resetPassword(dto: ResetPasswordDto) {
    this.garantirTamanhoBcrypt(dto.novaSenha);
    const invalido = new BadRequestException('Código inválido ou expirado.');

    // decode (sem verificar) só para descobrir de quem é o token; a
    // verificação de verdade vem logo abaixo, com o segredo daquele usuário.
    const naoVerificado = this.jwt.decode<{ sub?: string } | null>(dto.resetToken);
    const usuarioId = Number(naoVerificado?.sub);
    if (!Number.isInteger(usuarioId)) throw invalido;

    const { rows } = await this.db.query<{ senha_hash: string; papel: Papel }>(
      'SELECT senha_hash, papel FROM usuarios WHERE id = $1',
      [usuarioId],
    );
    if (!rows[0] || rows[0].papel !== 'aluno') throw invalido;

    let payload: { sub: string; ch: string };
    try {
      payload = await this.jwt.verifyAsync(dto.resetToken, { secret: this.segredoReset(rows[0].senha_hash) });
    } catch {
      throw invalido; // expirado, adulterado ou já usado (senha mudou)
    }

    const esperado = Buffer.from(payload.ch ?? '', 'hex');
    const recebido = Buffer.from(this.hmacCodigo(usuarioId, dto.codigo), 'hex');
    if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
      this.logger.warn(`Redefinição de senha recusada: usuario=${usuarioId} código incorreto`);
      throw invalido;
    }

    const novoHash = await bcrypt.hash(dto.novaSenha, BCRYPT_COST);
    await this.db.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [novoHash, usuarioId]);
    this.logger.log(`Senha redefinida: usuario=${usuarioId}`);

    return { mensagem: 'Senha redefinida com sucesso.' };
  }

  // --------------------------------------------------------------------------

  private async sessao(usuario: UsuarioPublico) {
    const payload: AccessTokenPayload = { sub: String(usuario.id), papel: usuario.papel };
    return {
      access_token: await this.jwt.signAsync(payload, { expiresIn: this.expiresIn }),
      token_type: 'Bearer',
      expires_in: this.expiresIn,
      usuario,
    };
  }

  private segredoReset(senhaHash: string) {
    return this.jwtSecret + senhaHash;
  }

  private hmacCodigo(usuarioId: number, codigo: string) {
    return createHmac('sha256', this.jwtSecret).update(`${usuarioId}:${codigo}`).digest('hex');
  }

  private garantirTamanhoBcrypt(senha: string) {
    if (Buffer.byteLength(senha, 'utf8') > BCRYPT_MAX_BYTES) {
      throw new BadRequestException(`A senha pode ter no máximo ${BCRYPT_MAX_BYTES} bytes.`);
    }
  }
}
