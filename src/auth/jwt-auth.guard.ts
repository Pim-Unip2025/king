import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccessTokenPayload, RequestAutenticada } from './auth.types.js';

// Só autentica: confere se o Bearer token é válido e não expirou, e pendura
// { id, papel } em request.usuario. Restringir por papel é a PIM-16.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    if (!Number.isInteger(id) || !payload.papel) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    (request as RequestAutenticada).usuario = { id, papel: payload.papel };
    return true;
  }
}
