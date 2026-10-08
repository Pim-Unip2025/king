import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ROTA_PUBLICA } from './auth.decorators.js';
import { AccessTokenPayload, PAPEIS, RequestAutenticada } from './auth.types.js';

// Guard GLOBAL (registrado como APP_GUARD no AuthModule): toda rota exige
// Bearer token válido, exceto as marcadas com @Public(). Confere assinatura e
// expiração e pendura { id, papel } em request.usuario. Restringir por papel
// é com o RolesGuard, que roda logo depois.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [context.getHandler(), context.getClass()]);
    if (publica) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const [tipo, token] = request.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token ausente.');
    }

    let payload: AccessTokenPayload;
    try {
      // Usa o JWT_SECRET padrão do módulo. resetToken é assinado com outro
      // segredo, então não passa aqui como se fosse login.
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    const id = Number(payload.sub);
    if (!Number.isInteger(id) || !PAPEIS.includes(payload.papel)) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    (request as RequestAutenticada).usuario = { id, papel: payload.papel };
    return true;
  }
}
