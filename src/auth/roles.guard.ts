import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PAPEIS_PERMITIDOS, ROTA_PUBLICA } from './auth.decorators.js';
import type { Papel, RequestAutenticada } from './auth.types.js';

// Guard GLOBAL, roda depois do JwtAuthGuard. Só age em rota com @Roles(...):
// sem o decorator, estar logado basta.
//
// Ele resolve "qual PAPEL pode chamar a rota". Regras que dependem do DADO —
// professor só no Reino dele, aluno só no próprio personagem — ficam no
// AcessoService, porque precisam consultar o banco com o id da URL.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const alvos = [context.getHandler(), context.getClass()];
    const papeis = this.reflector.getAllAndOverride<Papel[] | undefined>(PAPEIS_PERMITIDOS, alvos);
    if (!papeis?.length) return true;

    // @Public() + @Roles() na mesma rota não faz sentido: sem token não há
    // papel para conferir. Falha fechado em vez de liberar.
    if (this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, alvos)) {
      throw new ForbiddenException('Rota mal configurada: pública e restrita por papel ao mesmo tempo.');
    }

    const { usuario } = context.switchToHttp().getRequest<RequestAutenticada>();
    if (!usuario || !papeis.includes(usuario.papel)) {
      throw new ForbiddenException('Seu perfil não tem acesso a este recurso.');
    }
    return true;
  }
}
