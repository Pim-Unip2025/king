// Testes e2e de personagem e progresso (PIM-18). Rodam contra um Postgres de
// verdade com o schema, os seeds, as procedures e as triggers do repo Tronus.
//
// Usuários criados aqui têm o prefixo "e2e_" e são apagados no final
// (personagem, progresso e respostas vão junto por CASCADE).
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { DatabaseService } from '../src/database/database.service.js';
import { estrelasDaTentativa } from '../src/jogo/jogo.constants.js';

process.env.JWT_SECRET ??= 'segredo-so-para-teste-e2e';
process.env.JWT_EXPIRES_IN = '3600';

const sufixo = Date.now().toString().slice(-7);
const SENHA = 'Jogo@e2e1';
const PERSONAGEM = { nome: 'Arthur', genero: 'male', avatar: 'img/masc1.png' };

type Gabarito = { questaoId: number; correta: number; errada: number }[];

describe('Personagem e progresso (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const token: Record<'alunoA' | 'alunoB' | 'semPersonagem' | 'prof' | 'admin', string> = {} as never;
  let fases: number[]; // as 3 fases do Python, que têm questões nos seeds
  const gabarito: Record<number, Gabarito> = {};

  const http = () => request(app.getHttpServer());
  const como = (quem: keyof typeof token) => ({
    get: (rota: string) => http().get(rota).set('Authorization', `Bearer ${token[quem]}`),
    post: (rota: string, corpo?: object) =>
      http().post(rota).set('Authorization', `Bearer ${token[quem]}`).send(corpo),
  });
  const cadastrar = async (letra: string, digito: string) =>
    (
      await http()
        .post('/auth/register')
        .send({ nome: `e2e_jogo_${letra}_${sufixo}`, email: `e2e.jogo.${letra}.${sufixo}@tronus.com`, celular: `127${sufixo}${digito}`, senha: SENHA })
        .expect(201)
    ).body.access_token as string;
  const login = async (identificador: string, senha: string) =>
    (await http().post('/auth/login').send({ identificador, senha }).expect(200)).body.access_token as string;

  /** Monta as respostas de uma fase acertando exatamente `acertos` questões. */
  const respostas = (faseId: number, acertos: number) => ({
    respostas: gabarito[faseId].map((q, i) => ({ questaoId: q.questaoId, alternativaId: i < acertos ? q.correta : q.errada })),
  });
  const personagemDoAluno = async (quem: 'alunoA' | 'alunoB') => (await como(quem).get('/personagens/me').expect(200)).body;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication()) as INestApplication;
    await app.init();
    db = app.get(DatabaseService);

    fases = (
      await db.query<{ id: number }>(
        `SELECT f.id FROM fases f JOIN reinos r ON r.id = f.reino_id WHERE r.nome = 'Python' ORDER BY f.ordem`,
      )
    ).rows.map((f) => f.id);
    for (const faseId of fases) {
      const { rows } = await db.query<{ questao_id: number; correta: number; errada: number }>(
        `SELECT q.id AS questao_id,
                max(a.id) FILTER (WHERE a.correta) AS correta,
                min(a.id) FILTER (WHERE NOT a.correta) AS errada
           FROM questoes q JOIN alternativas a ON a.questao_id = q.id
          WHERE q.fase_id = $1 GROUP BY q.id ORDER BY q.id`,
        [faseId],
      );
      gabarito[faseId] = rows.map((r) => ({ questaoId: r.questao_id, correta: r.correta, errada: r.errada }));
    }

    token.alunoA = await cadastrar('a', '1');
    token.alunoB = await cadastrar('b', '2');
    token.semPersonagem = await cadastrar('c', '3');
    token.prof = await login('prof_python', 'Python@prof1');
    token.admin = await login('admin', 'Tronus@adm1');
  });

  afterAll(async () => {
    if (!app) return;
    await db.query("DELETE FROM usuarios WHERE nome LIKE 'e2e\\_%'");
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('régua de estrelas (mesma do quiz do front)', () => {
    it.each([
      [0, 0], [1, 1], [2, 1], [3, 2], [4, 3], [5, 3],
    ])('%i de 5 acertos -> %i estrelas', (acertos, estrelas) => {
      expect(estrelasDaTentativa(acertos, 5)).toBe(estrelas);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /personagens', () => {
    it('Critério: aluno cria personagem e ele nasce Plebeu com 0 estrelas', async () => {
      const res = await como('alunoA').post('/personagens', PERSONAGEM).expect(201);
      expect(res.body).toMatchObject({ ...PERSONAGEM, titulo_atual: 'Plebeu', total_estrelas: 0 });
      await como('alunoB').post('/personagens', { nome: 'Guinevere', genero: 'female', avatar: 'img/fem2.png' }).expect(201);
    });

    it('segundo personagem do mesmo aluno -> 409', async () => {
      await como('alunoA').post('/personagens', PERSONAGEM).expect(409);
    });

    it('não aceita mandar título ou estrelas no corpo -> 400', async () => {
      await como('semPersonagem').post('/personagens', { ...PERSONAGEM, titulo_atual: 'Rei', total_estrelas: 99 }).expect(400);
    });

    it.each([
      ['avatar fora da lista', { ...PERSONAGEM, avatar: 'https://site-malicioso/x.png' }],
      ['avatar de outro gênero', { ...PERSONAGEM, avatar: 'img/fem1.png' }],
      ['gênero inválido', { ...PERSONAGEM, genero: 'x' }],
      ['nome vazio', { ...PERSONAGEM, nome: '   ' }],
    ])('%s -> 400', async (_caso, corpo) => {
      await como('semPersonagem').post('/personagens', corpo).expect(400);
    });

    it('professor e admin não têm personagem -> 403', async () => {
      await como('prof').post('/personagens', PERSONAGEM).expect(403);
      await como('admin').get('/personagens/me').expect(403);
    });

    it('sem token -> 401', async () => {
      await http().post('/personagens').send(PERSONAGEM).expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /personagens/me e /me/progresso', () => {
    it('aluno sem personagem -> 404', async () => {
      await como('semPersonagem').get('/personagens/me').expect(404);
      await como('semPersonagem').get('/personagens/me/progresso').expect(404);
      await como('semPersonagem').post(`/fases/${fases[0]}/responder`, respostas(fases[0], 5)).expect(404);
    });

    it('progresso traz TODAS as fases, com 0 estrelas e jogada=false nas não jogadas', async () => {
      const total = Number((await db.query('SELECT count(*) FROM fases')).rows[0].count);
      const res = await como('alunoA').get('/personagens/me/progresso').expect(200);
      expect(res.body).toHaveLength(total);
      expect(res.body.every((f: { estrelas: number; jogada: boolean }) => f.estrelas === 0 && f.jogada === false)).toBe(true);
      expect(res.body[0]).toMatchObject({ reino_nome: 'Python', ordem: 1 });
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /fases/:id/responder', () => {
    it('Critério: grava em respostas_usuario e atualiza o progresso', async () => {
      const res = await como('alunoA').post(`/fases/${fases[0]}/responder`, respostas(fases[0], 3)).expect(200);
      expect(res.body).toMatchObject({ fase_id: fases[0], acertos: 3, total: 5, estrelas: 2, melhor_estrelas: 2 });
      expect(res.body.personagem).toMatchObject({ total_estrelas: 2, titulo_atual: 'Plebeu' });
      expect(res.body.correcao).toHaveLength(5);
      expect(res.body.correcao.filter((c: { acertou: boolean }) => c.acertou)).toHaveLength(3);

      const { id } = await personagemDoAluno('alunoA');
      const { rows } = await db.query<{ n: string; acertos: string }>(
        `SELECT count(*) AS n, count(*) FILTER (WHERE acertou) AS acertos
           FROM respostas_usuario WHERE personagem_id = $1 AND fase_id = $2`,
        [id, fases[0]],
      );
      expect(rows[0]).toEqual({ n: '5', acertos: '3' });

      const progresso = await como('alunoA').get('/personagens/me/progresso').expect(200);
      expect(progresso.body.find((f: { fase_id: number }) => f.fase_id === fases[0])).toMatchObject({ estrelas: 2, jogada: true });
    });

    it('Critério: refazer a fase com nota pior não reduz as estrelas', async () => {
      const res = await como('alunoA').post(`/fases/${fases[0]}/responder`, respostas(fases[0], 1)).expect(200);
      expect(res.body).toMatchObject({ estrelas: 1, melhor_estrelas: 2 });
      expect(res.body.personagem.total_estrelas).toBe(2);
    });

    it('refazer com nota melhor sobe as estrelas', async () => {
      const res = await como('alunoA').post(`/fases/${fases[0]}/responder`, respostas(fases[0], 5)).expect(200);
      expect(res.body).toMatchObject({ estrelas: 3, melhor_estrelas: 3 });
      expect(res.body.personagem.total_estrelas).toBe(3);
    });

    it('Critério: título sobe sozinho ao cruzar 15 estrelas, sem a API calcular nada', async () => {
      // As 3 fases do Python dão no máximo 9 estrelas. As outras fases ainda
      // não têm questões, então o progresso delas entra direto pela procedure
      // — o mesmo caminho que a API usa.
      const { id } = await personagemDoAluno('alunoA');
      const outras = (await db.query<{ id: number }>('SELECT id FROM fases WHERE NOT (id = ANY($1)) ORDER BY id LIMIT 3', [fases])).rows;
      for (const fase of outras) await db.query('CALL sp_registrar_progresso($1, $2, 3::smallint)', [id, fase.id]);
      await como('alunoA').post(`/fases/${fases[1]}/responder`, respostas(fases[1], 5)).expect(200); // 3 + 9 + 3 = 15

      const antes = await personagemDoAluno('alunoA');
      expect(antes).toMatchObject({ total_estrelas: 15, titulo_atual: 'Cavaleiro' });
    });

    it('Critério: um aluno não grava progresso no personagem de outro', async () => {
      const antesA = await personagemDoAluno('alunoA');
      const res = await como('alunoB').post(`/fases/${fases[2]}/responder`, respostas(fases[2], 5)).expect(200);
      expect(res.body.personagem.id).not.toBe(antesA.id);
      expect(await personagemDoAluno('alunoA')).toEqual(antesA);
      expect((await personagemDoAluno('alunoB')).total_estrelas).toBe(3);

      // Não há id de personagem para forjar: um campo extra no corpo é recusado.
      await como('alunoB')
        .post(`/fases/${fases[2]}/responder`, { ...respostas(fases[2], 5), personagemId: antesA.id })
        .expect(400);
    });

    it('professor e admin não jogam -> 403', async () => {
      await como('prof').post(`/fases/${fases[0]}/responder`, respostas(fases[0], 5)).expect(403);
      await como('admin').post(`/fases/${fases[0]}/responder`, respostas(fases[0], 5)).expect(403);
    });

    describe('respostas inválidas -> 400, e nada é gravado', () => {
      const contarRespostas = async () => {
        const { id } = await personagemDoAluno('alunoB');
        return Number((await db.query('SELECT count(*) FROM respostas_usuario WHERE personagem_id = $1', [id])).rows[0].count);
      };

      it.each([
        ['faltando questão', () => ({ respostas: respostas(fases[0], 5).respostas.slice(1) })],
        ['questão repetida', () => {
          const r = respostas(fases[0], 5).respostas;
          return { respostas: [...r.slice(1), r[1]] };
        }],
        ['questão de outra fase', () => ({ respostas: [...respostas(fases[0], 5).respostas.slice(1), respostas(fases[1], 5).respostas[0]] })],
        ['alternativa de outra questão', () => {
          const r = respostas(fases[0], 5).respostas;
          return { respostas: [{ ...r[0], alternativaId: r[1].alternativaId }, ...r.slice(1)] };
        }],
        ['lista vazia', () => ({ respostas: [] })],
        ['id que não é número', () => ({ respostas: [{ questaoId: 'abc', alternativaId: 1 }] })],
      ])('%s', async (_caso, corpo) => {
        const antes = await contarRespostas();
        await como('alunoB').post(`/fases/${fases[0]}/responder`, corpo()).expect(400);
        expect(await contarRespostas()).toBe(antes);
      });
    });

    it('fase inexistente -> 404', async () => {
      await como('alunoA').post('/fases/999999/responder', respostas(fases[0], 5)).expect(404);
    });

    it('fase sem questões -> 400', async () => {
      const vazia = (await db.query<{ id: number }>('SELECT f.id FROM fases f WHERE NOT EXISTS (SELECT 1 FROM questoes q WHERE q.fase_id = f.id) LIMIT 1')).rows[0].id;
      await como('alunoA').post(`/fases/${vazia}/responder`, { respostas: [{ questaoId: 1, alternativaId: 1 }] }).expect(400);
    });

    it('sem token -> 401', async () => {
      await http().post(`/fases/${fases[0]}/responder`).send(respostas(fases[0], 5)).expect(401);
    });
  });
});
