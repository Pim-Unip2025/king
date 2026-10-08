// Testes e2e das rotas de conteúdo (PIM-17): Reinos, Fases e questões.
// Rodam contra um Postgres de verdade com o schema e os seeds do repo Tronus.
//
// Usuários criados aqui têm o prefixo "e2e_" e são apagados no final.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { DatabaseService } from '../src/database/database.service.js';

process.env.JWT_SECRET ??= 'segredo-so-para-teste-e2e';
process.env.JWT_EXPIRES_IN = '3600';

const sufixo = Date.now().toString().slice(-7);
const SENHA = 'Conteudo@e2e1';

/** Procura o campo `correta` em qualquer nível do JSON, até no texto cru. */
const temCorreta = (body: unknown) => JSON.stringify(body).includes('"correta"');

describe('Conteúdo: Reinos, Fases e questões (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const token: Record<'admin' | 'profPython' | 'profCpp' | 'aluno', string> = {} as never;
  let fasePython1: number;
  let fasePython2: number;
  let reinoPython: number;

  const http = () => request(app.getHttpServer());
  const get = (rota: string, quem: keyof typeof token) =>
    http().get(rota).set('Authorization', `Bearer ${token[quem]}`);
  const login = async (identificador: string, senha: string) =>
    (await http().post('/auth/login').send({ identificador, senha }).expect(200)).body.access_token as string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication()) as INestApplication;
    await app.init();
    db = app.get(DatabaseService);

    reinoPython = (await db.query<{ id: number }>(`SELECT id FROM reinos WHERE nome = 'Python'`)).rows[0].id;
    const fases = await db.query<{ id: number }>('SELECT id FROM fases WHERE reino_id = $1 ORDER BY ordem', [reinoPython]);
    [fasePython1, fasePython2] = fases.rows.map((f) => f.id);

    const hash = await bcrypt.hash(SENHA, 10);
    await db.query(
      `INSERT INTO usuarios (nome, email, celular, senha_hash, papel, professor_reino_id)
       SELECT $1, $2, '12900000001', $3, 'professor', id FROM reinos WHERE nome = 'C++'`,
      [`e2e_prof_cpp_c_${sufixo}`, `e2e.prof.cpp.c.${sufixo}@tronus.com`, hash],
    );
    await http()
      .post('/auth/register')
      .send({ nome: `e2e_aluno_c_${sufixo}`, email: `e2e.c.${sufixo}@tronus.com`, celular: `128${sufixo}3`, senha: SENHA })
      .expect(201);

    token.admin = await login('admin', 'Tronus@adm1');
    token.profPython = await login('prof_python', 'Python@prof1');
    token.profCpp = await login(`e2e_prof_cpp_c_${sufixo}`, SENHA);
    token.aluno = await login(`e2e_aluno_c_${sufixo}`, SENHA);
  });

  afterAll(async () => {
    if (!app) return;
    await db.query("DELETE FROM usuarios WHERE nome LIKE 'e2e\\_%'");
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('GET /reinos', () => {
    it('devolve os 5 Reinos dos seeds com descrição', async () => {
      const res = await get('/reinos', 'aluno').expect(200);
      expect(res.body.map((r: { nome: string }) => r.nome)).toEqual(
        expect.arrayContaining(['Python', 'C++', 'Engenharia de Software', 'Banco de Dados', 'Redes']),
      );
      expect(res.body).toHaveLength(5);
      for (const reino of res.body) {
        expect(Object.keys(reino).sort()).toEqual(['descricao', 'id', 'nome']);
        expect(reino.descricao).toEqual(expect.any(String));
      }
    });

    it('sem token -> 401', async () => {
      await http().get('/reinos').expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /reinos/:id/fases', () => {
    it('devolve as 3 fases do Reino na ordem 1, 2, 3', async () => {
      const res = await get(`/reinos/${reinoPython}/fases`, 'aluno').expect(200);
      expect(res.body.map((f: { ordem: number }) => f.ordem)).toEqual([1, 2, 3]);
      expect(res.body.every((f: { reino_id: number }) => f.reino_id === reinoPython)).toBe(true);
      expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'nome', 'ordem', 'reino_id']);
    });

    it('Reino inexistente -> 404', async () => {
      await get('/reinos/999999/fases', 'aluno').expect(404);
    });

    it('id que não é número -> 400', async () => {
      await get('/reinos/abc/fases', 'aluno').expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /fases/:id/questoes', () => {
    it('devolve as 5 questões da fase com 5 alternativas cada, ordenadas por letra', async () => {
      const res = await get(`/fases/${fasePython1}/questoes`, 'aluno').expect(200);
      expect(res.body).toHaveLength(5);
      for (const questao of res.body) {
        expect(questao).toMatchObject({ fase_id: fasePython1, enunciado: expect.any(String) });
        expect(questao.alternativas.map((a: { letra: string }) => a.letra)).toEqual(['A', 'B', 'C', 'D', 'E']);
      }
    });

    it('aluno NUNCA recebe o campo `correta`', async () => {
      for (const fase of [fasePython1, fasePython2]) {
        const res = await get(`/fases/${fase}/questoes`, 'aluno').expect(200);
        expect(temCorreta(res.body)).toBe(false);
        expect(Object.keys(res.body[0].alternativas[0]).sort()).toEqual(['id', 'letra', 'texto']);
      }
    });

    it('aluno não consegue pedir o `correta` por query string', async () => {
      const res = await get(`/fases/${fasePython1}/questoes?correta=true&comCorreta=1&papel=admin`, 'aluno').expect(200);
      expect(temCorreta(res.body)).toBe(false);
    });

    it('professor do Reino recebe `correta`, com exatamente uma certa por questão', async () => {
      const res = await get(`/fases/${fasePython1}/questoes`, 'profPython').expect(200);
      for (const questao of res.body) {
        const corretas = questao.alternativas.filter((a: { correta: boolean }) => a.correta === true);
        expect(corretas).toHaveLength(1);
        expect(questao.alternativas.every((a: { correta: unknown }) => typeof a.correta === 'boolean')).toBe(true);
      }
    });

    it('`correta` bate com o banco', async () => {
      const res = await get(`/fases/${fasePython1}/questoes`, 'profPython').expect(200);
      const { rows } = await db.query<{ id: number }>(
        `SELECT a.id FROM alternativas a JOIN questoes q ON q.id = a.questao_id
          WHERE q.fase_id = $1 AND a.correta ORDER BY a.id`,
        [fasePython1],
      );
      const daApi = res.body
        .flatMap((q: { alternativas: { id: number; correta: boolean }[] }) => q.alternativas)
        .filter((a: { correta: boolean }) => a.correta)
        .map((a: { id: number }) => a.id)
        .sort((a: number, b: number) => a - b);
      expect(daApi).toEqual(rows.map((r) => r.id));
    });

    it('admin recebe `correta`', async () => {
      const res = await get(`/fases/${fasePython1}/questoes`, 'admin').expect(200);
      expect(temCorreta(res.body)).toBe(true);
    });

    it('professor de OUTRO Reino vê as questões como aluno, sem `correta`', async () => {
      const res = await get(`/fases/${fasePython1}/questoes`, 'profCpp').expect(200);
      expect(res.body).toHaveLength(5);
      expect(temCorreta(res.body)).toBe(false);
    });

    it('fase sem questões -> lista vazia', async () => {
      const faseVazia = (
        await db.query<{ id: number }>(
          'SELECT f.id FROM fases f WHERE NOT EXISTS (SELECT 1 FROM questoes q WHERE q.fase_id = f.id) LIMIT 1',
        )
      ).rows[0].id;
      const res = await get(`/fases/${faseVazia}/questoes`, 'aluno').expect(200);
      expect(res.body).toEqual([]);
    });

    it('fase inexistente -> 404', async () => {
      await get('/fases/999999/questoes', 'aluno').expect(404);
    });

    it('sem token -> 401', async () => {
      await http().get(`/fases/${fasePython1}/questoes`).expect(401);
    });
  });
});
