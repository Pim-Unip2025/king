import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Papel, RequestAutenticada, UsuarioAutenticado } from './auth.types.js';

export const ROTA_PUBLICA = 'rotaPublica';
export const PAPEIS_PERMITIDOS = 'papeisPermitidos';

/**
 * Libera a rota sem token. Toda rota exige login por padrão (JwtAuthGuard é
 * global); quem é pública precisa se declarar — esquecer o decorator fecha a
 * rota, nunca abre.
 */
export const Public = () => SetMetadata(ROTA_PUBLICA, true);

/**
 * Restringe a rota (ou o controller inteiro) aos papéis listados.
 * Sem @Roles, qualquer usuário logado passa.
 *
 *   @Roles('professor', 'admin')
 */
export const Roles = (...papeis: [Papel, ...Papel[]]) => SetMetadata(PAPEIS_PERMITIDOS, papeis);

/** Injeta { id, papel } do usuário logado no parâmetro do handler. */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, context: ExecutionContext): UsuarioAutenticado =>
    context.switchToHttp().getRequest<RequestAutenticada>().usuario,
);
