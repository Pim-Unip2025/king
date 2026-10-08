// Testes e2e da camada transversal (PIM-21): validação, formato padronizado
// de erro, tradução dos erros do Postgres e logs sem segredo.
//
// Para provocar cada tipo de erro do banco sem depender de rota de negócio,
// monta um controller SÓ DE TESTE que roda SQL que falha de propósito (o
// mesmo truque do autorizacao.e2e-spec.ts).
//
// Usuários criados aqui têm o prefixo "e2e_" e são apagados no final.
import { ConsoleLogger, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { Public } from '../src/auth/auth.decorators.js';
import { DatabaseService } from '../src/database/database.service.js';

process.env.JWT_SECRET ??= 'segredo-so-para-teste-e2e';
process.env.JWT_EXPIRES_IN = '3600';
process.env.SIMULAR_SMS = 'true'; // para o código de redefinição vir na resposta e dar para procurar no log

const sufixo = Date.now().toString().slice(-7);
const SENHA = 'Erros@e2e1';
const NOVA_SENHA = 'Erros@e2e2';
const ENUNCIADO = `e2e_erros_${sufixo}`;

@Public()
@Controller('teste-erros')
class ErrosDeTesteController {
  constructor(private readonly db: DatabaseService) {}

  @Post('unique')
  unique() {
    return this.db.query(`INSERT INTO reinos (nome) VALUES ('Python')`);
  }

  @Post('fk')
  fk() {
    return this.db.query(`INSERT INTO fases (reino_id, nome, ordem) VALUES (999999, 'x', 1)`);
  }

  @Post('check')
  check() {
    // Aluno com Reino: viola ck_usuarios_reino_do_professor
    return this.db.query(`UPDATE usuarios SET professor_reino_id = 1 WHERE nome = 'admin'`);
  }

  @Post('trigger')
  trigger() {
    // Questão com DUAS corretas: a trigger deferida explode no COMMIT.
    return this.db.transacao(async (query) => {
      const { rows } = await query<{ id: number }>(
        `INSERT INTO questoes (fase_id, enunciado) SELECT id, $1 FROM fases ORDER BY id LIMIT 1 RETURNING id`,
        [ENUNCIADO],
      );
      await query(
        `INSERT INTO alternativas (questao_id, letra, texto, correta)
         SELECT $1, l, l, l IN ('A', 'B') FROM unnest(ARRAY['A','B','C','D','E']) AS l`,
        [rows[0].id],
      );
    });
  }

  @Get('sql-quebrado')
  sqlQuebrado() {
    return this.db.query('SELECT coluna_que_nao_existe FROM usuarios');
  }

  @Get('bug')
  bug() {
    throw new Error('bug interno com detalhe sensível: /home/app/src/x.ts');
  }
}

describe('Erros, validação e logs (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const saida: string[] = [];
  const escritaOriginal = { out: process.stdout.write, err: process.stderr.write };

  const http = () => request(app.getHttpServer());

  /** Formato padronizado e sem vazamento de stack/SQL. */
  const conferirFormato = (body: Record<string, unknown>, status: number, path: string) => {
    expect(Object.keys(body).sort()).toEqual(['error', 'message', 'path', 'statusCode', 'timestamp']);
    expect(body.statusCode).toBe(status);
    expect(body.path).toBe(path);
    expect(new Date(body.timestamp as string).toISOString()).toBe(body.timestamp);
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/\bat \S+ \(|\.ts:\d+|node_modules|stack/i);
    expect(json).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\b/);
    expect(json).not.toMatch(/constraint|relation|violates|Key \(/i);
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ErrosDeTesteController],
    })
      // O logger padrão do @nestjs/testing engole log/warn; aqui o log é o
      // que está sendo testado, então usa o de verdade.
      .setLogger(new ConsoleLogger())
      .compile();
    app = configurarApp(modulo.createNestApplication()) as INestApplication;
    await app.init();
    db = app.get(DatabaseService);

    const capturar = (original: typeof process.stdout.write) =>
      function (this: unknown, chunk: unknown, ...resto: unknown[]) {
        saida.push(String(chunk));
        return (original as (...a: unknown[]) => boolean).call(process.stdout, chunk, ...resto);
      } as typeof process.stdout.write;
    process.stdout.write = capturar(escritaOriginal.out);
    process.stderr.write = capturar(escritaOriginal.err);
  });

  afterAll(async () => {
    process.stdout.write = escritaOriginal.out;
    process.stderr.write = escritaOriginal.err;
    if (!app) return;
    await db.query('DELETE FROM questoes WHERE enunciado = $1', [ENUNCIADO]);
    await db.query("DELETE FROM usuarios WHERE nome LIKE 'e2e\\_erros\\_%'");
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('validação de entrada', () => {
    it('campo extra no corpo -> 400 no formato padrão', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ identificador: 'admin', senha: 'x', papel: 'admin' })
        .expect(400);
      conferirFormato(res.body, 400, '/auth/login');
      expect(res.body.message).toEqual(['O campo "papel" não é permitido.']);
    });

    it('campo extra dentro de lista também é traduzido', async () => {
      const aluno = await http()
        .post('/auth/register')
        .send({ nome: `e2e_erros_val_${sufixo}`, email: `e2e.erros.val.${sufixo}@tronus.com`, celular: `125${sufixo}6`, senha: SENHA })
        .expect(201);
      const res = await http()
        .post('/fases/1/responder')
        .set('Authorization', `Bearer ${aluno.body.access_token}`)
        .send({ respostas: [{ questaoId: 1, alternativaId: 1, acertou: true }] })
        .expect(400);
      expect(res.body.message).toEqual(['O campo "respostas.0.acertou" não é permitido.']);
    });

    it('erro de validação não ecoa o valor enviado', async () => {
      const res = await http()
        .post('/auth/register')
        .send({ nome: 'e2e x', email: 'nao-e-email', celular: '1', senha: 'SenhaFraca' })
        .expect(400);
      expect(JSON.stringify(res.body)).not.toContain('SenhaFraca');
    });

    it('JSON malformado -> 400 no formato padrão', async () => {
      const res = await http().post('/auth/login').set('Content-Type', 'application/json').send('{"identificador":').expect(400);
      conferirFormato(res.body, 400, '/auth/login');
    });
  });

  // ---------------------------------------------------------------------------
  describe('formato padronizado', () => {
    it('401, 403 e 404 saem no mesmo formato', async () => {
      conferirFormato((await http().get('/reinos').expect(401)).body, 401, '/reinos');
      const login = await http().post('/auth/login').send({ identificador: 'prof_python', senha: 'Python@prof1' }).expect(200);
      const tk = login.body.access_token;
      conferirFormato(
        (await http().get('/professor/alunos/999999/desempenho').set('Authorization', `Bearer ${tk}`).expect(404)).body,
        404,
        '/professor/alunos/999999/desempenho',
      );
      conferirFormato((await http().get('/personagens/me').set('Authorization', `Bearer ${tk}`).expect(403)).body, 403, '/personagens/me');
    });

    it('path não leva a query string', async () => {
      const res = await http().get('/reinos?segredo=abc').expect(401);
      expect(res.body.path).toBe('/reinos');
    });

    it('rota que não existe -> 404 no formato padrão', async () => {
      const res = await http().get('/nao-existe').expect(404);
      conferirFormato(res.body, 404, '/nao-existe');
    });
  });

  // ---------------------------------------------------------------------------
  describe('erros do Postgres', () => {
    it('unique -> 409', async () => {
      const res = await http().post('/teste-erros/unique').expect(409);
      conferirFormato(res.body, 409, '/teste-erros/unique');
    });

    it('e-mail duplicado no cadastro -> 409, não 500', async () => {
      const corpo = { nome: `e2e_erros_dup_${sufixo}`, email: `e2e.erros.dup.${sufixo}@tronus.com`, celular: `125${sufixo}9`, senha: SENHA };
      await http().post('/auth/register').send(corpo).expect(201);
      const res = await http()
        .post('/auth/register')
        .send({ ...corpo, nome: `e2e_erros_dup2_${sufixo}`, celular: `125${sufixo}8` })
        .expect(409);
      conferirFormato(res.body, 409, '/auth/register');
    });

    it('FK -> 400 com mensagem amigável', async () => {
      const res = await http().post('/teste-erros/fk').expect(400);
      conferirFormato(res.body, 400, '/teste-erros/fk');
      expect(res.body.message).toBe('Reino não encontrado.');
    });

    it('CHECK -> 400 com mensagem amigável', async () => {
      const res = await http().post('/teste-erros/check').expect(400);
      conferirFormato(res.body, 400, '/teste-erros/check');
      expect(res.body.message).toBe('Professor precisa ter um Reino; aluno e admin não podem ter Reino.');
    });

    it('trigger de alternativas (deferida, no COMMIT) -> 400 com a mensagem do banco', async () => {
      const res = await http().post('/teste-erros/trigger').expect(400);
      conferirFormato(res.body, 400, '/teste-erros/trigger');
      expect(res.body.message).toMatch(/precisa ter exatamente uma alternativa correta \(encontradas: 2\)/);
      // E o ROLLBACK desfez a questão.
      const { rows } = await db.query('SELECT 1 FROM questoes WHERE enunciado = $1', [ENUNCIADO]);
      expect(rows).toHaveLength(0);
    });

    it('SQL quebrado -> 500 genérico, sem SQL na resposta', async () => {
      const res = await http().get('/teste-erros/sql-quebrado').expect(500);
      conferirFormato(res.body, 500, '/teste-erros/sql-quebrado');
      expect(res.body.message).toBe('Erro interno.');
      expect(JSON.stringify(res.body)).not.toContain('coluna_que_nao_existe');
    });

    it('bug no código -> 500 genérico, sem stack nem detalhe', async () => {
      const res = await http().get('/teste-erros/bug').expect(500);
      conferirFormato(res.body, 500, '/teste-erros/bug');
      expect(JSON.stringify(res.body)).not.toContain('/home/app');
    });

    it('a conexão continua saudável depois dos erros', async () => {
      await http().get('/health').expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  describe('logs', () => {
    it('registram autenticação, erros e procedures — sem senha, hash, token ou código', async () => {
      const nome = `e2e_erros_log_${sufixo}`;
      const celular = `125${sufixo}7`;

      const cadastro = await http()
        .post('/auth/register')
        .send({ nome, email: `e2e.erros.log.${sufixo}@tronus.com`, celular, senha: SENHA })
        .expect(201);
      const token = cadastro.body.access_token as string;

      await http().post('/auth/login').send({ identificador: nome, senha: 'Errada@123' }).expect(401);
      // Senha digitada no campo de usuário não pode parar no log.
      await http().post('/auth/login').send({ identificador: SENHA, senha: SENHA }).expect(401);
      await http().post('/auth/login').send({ identificador: nome, senha: SENHA }).expect(200);
      await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      await http().get('/auth/me').set('Authorization', `Bearer ${token}x`).expect(401);

      const esqueci = await http().post('/auth/forgot-password').send({ celular }).expect(200);
      const { reset_token, codigo } = esqueci.body as { reset_token: string; codigo: string };
      await http().post('/auth/reset-password').send({ resetToken: reset_token, codigo, novaSenha: NOVA_SENHA }).expect(200);

      // Gera uma chamada de procedure.
      await http()
        .post('/personagens')
        .set('Authorization', `Bearer ${token}`)
        .send({ nome: 'Logado', genero: 'male', avatar: 'img/masc2.png' })
        .expect(201);
      const { rows } = await db.query<{ fase_id: number; questao_id: number; alt: number }>(
        `SELECT q.fase_id, q.id AS questao_id, min(a.id) AS alt FROM questoes q JOIN alternativas a ON a.questao_id = q.id
          WHERE q.fase_id = (SELECT min(fase_id) FROM questoes) GROUP BY q.fase_id, q.id`,
      );
      await http()
        .post(`/fases/${rows[0].fase_id}/responder`)
        .set('Authorization', `Bearer ${token}`)
        .send({ respostas: rows.map((r) => ({ questaoId: r.questao_id, alternativaId: r.alt })) })
        .expect(200);

      const { rows: hash } = await db.query<{ senha_hash: string }>('SELECT senha_hash FROM usuarios WHERE nome = $1', [nome]);
      const log = saida.join('');

      // O que DEVE estar
      expect(log).toMatch(/Cadastro: usuario=\d+/);
      expect(log).toMatch(/Login recusado/);
      expect(log).toMatch(/Login: usuario=\d+ papel=aluno/);
      expect(log).toMatch(/Senha redefinida: usuario=\d+/);
      expect(log).toMatch(/sp_registrar_progresso personagem=\d+ fase=\d+ estrelas=\d/);
      expect(log).toMatch(/POST \/teste-erros\/trigger -> 400/);
      expect(log).toMatch(/GET \/teste-erros\/sql-quebrado -> 500/);

      // O que NUNCA pode estar
      for (const segredo of [SENHA, NOVA_SENHA, 'Errada@123', token, reset_token, hash[0].senha_hash]) {
        expect(log).not.toContain(segredo);
      }
      expect(log).not.toMatch(/\$2[aby]\$\d\d\$/); // nenhum hash bcrypt
      expect(log).not.toMatch(/eyJ[\w-]+\.eyJ[\w-]+/); // nenhum JWT
      expect(log).not.toMatch(new RegExp(`c[oó]digo[^\\n]*\\b${codigo}\\b`));
    });
  });
});
