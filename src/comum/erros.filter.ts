import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ehErroPostgres, traduzirErroPostgres } from './erros-postgres.js';

/** Formato de TODA resposta de erro da API. */
export interface CorpoErro {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

const NOME_STATUS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
};

// O whitelist do ValidationPipe gera "property x should not exist" em inglês
// (vem do class-validator, sem opção de mensagem). Traduz só esse caso.
const CAMPO_EXTRA = /^(?:(.+)\.)?property (\S+) should not exist$/;
function traduzirValidacao(message: string | string[]): string | string[] {
  const traduzir = (m: string) => m.replace(CAMPO_EXTRA, (_t, pai: string | undefined, campo: string) => `O campo "${pai ? `${pai}.` : ''}${campo}" não é permitido.`);
  return Array.isArray(message) ? message.map(traduzir) : traduzir(message);
}

// Filtro GLOBAL (registrado no configurarApp). Pega qualquer exceção — do
// Nest, do driver pg ou bug nosso — e devolve sempre o mesmo formato.
//
// Regras:
//  - nunca devolve stack trace, SQL ou mensagem crua do banco
//  - erro do Postgres que é culpa do dado vira 400/409 (erros-postgres.ts)
//  - o resto vira 500 "Erro interno" e o detalhe vai SÓ para o log
//  - 4xx é logado como warn, 5xx como error. O log tem método, rota e
//    mensagem — nunca corpo da requisição nem header (senha e token)
@Catch()
export class ErrosFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(excecao: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { status, message, error } = this.resolver(excecao);
    // Sem query string: o path vai para a resposta e para o log.
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];

    const corpo: CorpoErro = { statusCode: status, message, error, timestamp: new Date().toISOString(), path };

    const linha = `${req.method} ${path} -> ${status} ${Array.isArray(message) ? message.join('; ') : message}`;
    if (status >= 500) {
      const detalhe = excecao instanceof Error ? excecao.stack ?? excecao.message : String(excecao);
      this.logger.error(linha, detalhe);
    } else {
      this.logger.warn(linha);
    }

    res.status(status).json(corpo);
  }

  private resolver(excecao: unknown): { status: number; message: string | string[]; error: string } {
    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      const resposta = excecao.getResponse();
      if (typeof resposta === 'string') return { status, message: resposta, error: NOME_STATUS[status] ?? excecao.name };
      const r = resposta as { message?: string | string[]; error?: string };
      return {
        status,
        message: traduzirValidacao(r.message ?? excecao.message),
        error: r.error ?? NOME_STATUS[status] ?? excecao.name,
      };
    }

    if (ehErroPostgres(excecao)) {
      const traduzido = traduzirErroPostgres(excecao);
      if (traduzido) {
        return { status: traduzido.status, message: traduzido.mensagem, error: NOME_STATUS[traduzido.status] };
      }
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Erro interno.', error: NOME_STATUS[500] };
  }
}
