import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

/** Função de consulta dentro de uma transação (mesma assinatura do query). */
export type Consulta = <T extends QueryResultRow = any>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 1,                            // serverless: 1 processo = 1 conexão
      ssl: { rejectUnauthorized: false }, // cert do pooler do Supabase
    });
  }

  query<T extends QueryResultRow = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  /**
   * Roda `fn` dentro de BEGIN/COMMIT numa conexão só. Qualquer erro dá
   * ROLLBACK e é relançado. Funciona com o transaction pooler do Supabase:
   * a transação inteira fica na mesma conexão do servidor.
   */
  async transacao<R>(fn: (query: Consulta) => Promise<R>): Promise<R> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await fn((sql, params) => cliente.query(sql, params));
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw erro;
    } finally {
      cliente.release();
    }
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}