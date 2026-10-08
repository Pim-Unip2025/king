// Testes e2e de desempenho e estatísticas (PIM-19). Rodam contra um Postgres
// de verdade com os scripts do repo Tronus: os números vêm das funções
// fn_estatisticas_personagem, fn_resumo_geral, fn_buscar_alunos e
// fn_desempenho_aluno, e aqui são conferidos contra a conta feita à mão.
//
// Usuários criados aqui têm o prefixo "e2e_" e são apagados no final.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { DatabaseService } from '../src/database/database.service.js';

process.env.JWT_SECRET ??= 'segredo-so-para-teste-e2e';
process.env.JWT_EXPIRES_IN = '3600';

const sufixo = Date.now().toString().slice(-7);
const SENHA = 'Desemp@e2e1';
const PREFIXO = `e2e_desemp_${sufixo}`;

type Quem = 'admin' | 'profPython' | 'alunoA' | 'alunoB';

describe('Desempenho e estatísticas (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const token: Record<Quem, string> = {} as never;
  const usuarioId: Record<'alunoA' | 'alunoB', number> = {} as never;
  let fase1: number;
  let fase2: number;

  const http = () => request(app.getHttpServer());
  const get = (rota: string, quem: Quem) => http().get(rota).set('Authorization', `Bearer ${token[quem]}`);
  const loginSeed = async (identificador: string, senha: string) =>
    (await http().post('/auth/login').send({ identificador, senha }).expect(200)).body.access_token as string;

  /** Responde a fase acertando as `acertos` primeiras questões. */
  const jogar = async (fase: number, acertos: number) => {
    const { rows } = await db.query<{ questao_id: number; certa: number; errada: number }>(
      `SELECT q.id AS questao_id,
              min(a.id) FILTER (WHERE a.correta) AS certa,
              min(a.id) FILTER (WHERE NOT a.correta) AS errada
         FROM questoes q JOIN alternativas a ON a.questao_id = q.id
        WHERE q.fase_id = $1 GROUP BY q.id ORDER BY q.id`,
      [fase],
    );
    const respostas = rows.map((q, i) => ({ questaoId: q.questao_id, alternativaId: i < acertos ? q.certa : q.errada }));
    await http()
      .post(`/fases/${fase}/responder`)
      .set('Authorization', `Bearer ${token.alunoA}`)
      .send({ respostas })
      .expect(200);
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication()) as INestApplication;
    await app.init();
    db = app.get(DatabaseService);

    [fase1, fase2] = (
      await db.query<{ id: number }>(
        `SELECT f.id FROM fases f JOIN reinos r ON r.id = f.reino_id WHERE r.nome = 'Python' ORDER BY f.ordem`,
      )
    ).rows.map((f) => f.id);

    for (const [quem, letra, digito] of [['alunoA', 'a', '1'], ['alunoB', 'b', '2']] as const) {
      const res = await http()
        .post('/auth/register')
        .send({ nome: `${PREFIXO}_${letra}`, email: `e2e.desemp.${letra}.${sufixo}@tronus.com`, celular: `126${sufixo}${digito}`, senha: SENHA })
        .expect(201);
      token[quem] = res.body.access_token;
      usuarioId[quem] = res.body.usuario.id;
    }
    token.admin = await loginSeed('admin', 'Tronus@adm1');
    token.profPython = await loginSeed('prof_python', 'Python@prof1');

    // Só o aluno A cria personagem e joga:
    //   fase 1: 4/5 (3 estrelas) e depois 2/5 -> 10 respostas, 6 acertos, 60.0%, fica 3 estrelas
    //   fase 2: 1/5 (1 estrela)               ->  5 respostas, 1 acerto,  20.0%
    //   geral: 15 respostas, 7 acertos -> 7/15 = 46.666... -> 46.7%
    await http()
      .post('/personagens')
      .set('Authorization', `Bearer ${token.alunoA}`)
      .send({ nome: 'Analista', genero: 'female', avatar: 'img/fem2.png' })
      .expect(201);
    await jogar(fase1, 4);
    await jogar(fase1, 2);
    await jogar(fase2, 1);
  });

  afterAll(async () => {
    if (!app) return;
    await db.query("DELETE FROM usuarios WHERE nome LIKE 'e2e\\_desemp\\_%'");
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('GET /personagens/me/estatisticas', () => {
    it('confere com a conta feita à mão, com números (não strings)', async () => {
      const res = await get('/personagens/me/estatisticas', 'alunoA').expect(200);
      const porFase = (id: number) => res.body.find((f: { fase_id: number }) => f.fase_id === id);

      expect(porFase(fase1)).toEqual({ reino: 'Python', fase_id: fase1, fase: expect.any(String), tentativas: 10, acertos: 6, taxa_acerto: 60, estrelas: 3 });
      expect(porFase(fase2)).toMatchObject({ tentativas: 5, acertos: 1, taxa_acerto: 20, estrelas: 1 });
    });

    it('fases não jogadas aparecem zeradas, e são todas as fases', async () => {
      const res = await get('/personagens/me/estatisticas', 'alunoA').expect(200);
      const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM fases');
      expect(res.body).toHaveLength(rows[0].n);
      const outras = res.body.filter((f: { fase_id: number }) => f.fase_id !== fase1 && f.fase_id !== fase2);
      for (const f of outras) expect(f).toMatchObject({ tentativas: 0, acertos: 0, taxa_acerto: 0, estrelas: 0 });
    });

    it('aluno sem personagem -> 404', async () => {
      await get('/personagens/me/estatisticas', 'alunoB').expect(404);
    });

    it('professor -> 403, sem token -> 401', async () => {
      await get('/personagens/me/estatisticas', 'profPython').expect(403);
      await http().get('/personagens/me/estatisticas').expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /personagens/me/resumo', () => {
    it('confere com a conta feita à mão', async () => {
      const res = await get('/personagens/me/resumo', 'alunoA').expect(200);
      expect(res.body).toEqual({
        total_respostas: 15,
        total_acertos: 7,
        taxa_geral: 46.7,
        total_estrelas: 4,
        fases_iniciadas: 2,
        fases_completas: 1,
      });
    });

    it('aluno sem personagem -> 404; admin -> 403', async () => {
      await get('/personagens/me/resumo', 'alunoB').expect(404);
      await get('/personagens/me/resumo', 'admin').expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /professor/alunos', () => {
    it('busca sem diferenciar maiúsculas e devolve aluno com e sem personagem', async () => {
      const res = await get(`/professor/alunos?nome=${PREFIXO.toUpperCase()}`, 'profPython').expect(200);
      expect(res.body.map((a: { usuario_nome: string }) => a.usuario_nome)).toEqual([`${PREFIXO}_a`, `${PREFIXO}_b`]);

      const [a, b] = res.body;
      expect(a).toMatchObject({ usuario_id: usuarioId.alunoA, personagem_nome: 'Analista', titulo_atual: 'Plebeu', total_estrelas: 4 });
      expect(b).toMatchObject({ usuario_id: usuarioId.alunoB, personagem_id: null, total_estrelas: 0 });
    });

    it('só lista alunos', async () => {
      const res = await get('/professor/alunos', 'admin').expect(200);
      const nomes = res.body.map((a: { usuario_nome: string }) => a.usuario_nome);
      expect(nomes).not.toContain('admin');
      expect(nomes).not.toContain('prof_python');
    });

    it('% e _ são texto, não curinga', async () => {
      expect((await get('/professor/alunos?nome=%25', 'profPython').expect(200)).body).toEqual([]);
      const comUnderline = await get(`/professor/alunos?nome=desemp_${sufixo}_a`, 'profPython').expect(200);
      expect(comUnderline.body).toHaveLength(1);
    });

    it('parâmetro desconhecido ou nome longo demais -> 400', async () => {
      await get('/professor/alunos?papel=admin', 'profPython').expect(400);
      await get(`/professor/alunos?nome=${'x'.repeat(61)}`, 'profPython').expect(400);
    });

    it('aluno -> 403, sem token -> 401', async () => {
      await get('/professor/alunos', 'alunoA').expect(403);
      await http().get('/professor/alunos').expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /professor/alunos/:id/desempenho', () => {
    it('professor e admin veem o mesmo que o aluno vê no dashboard dele', async () => {
      const doAluno = (await get('/personagens/me/estatisticas', 'alunoA').expect(200)).body;
      const doProf = await get(`/professor/alunos/${usuarioId.alunoA}/desempenho`, 'profPython').expect(200);
      const doAdmin = await get(`/professor/alunos/${usuarioId.alunoA}/desempenho`, 'admin').expect(200);
      expect(doProf.body).toEqual(doAluno);
      expect(doAdmin.body).toEqual(doAluno);
    });

    it('aluno não usa a rota do professor, nem para ler outro aluno -> 403', async () => {
      await get(`/professor/alunos/${usuarioId.alunoA}/desempenho`, 'alunoA').expect(403);
      await get(`/professor/alunos/${usuarioId.alunoA}/desempenho`, 'alunoB').expect(403);
    });

    it('aluno sem personagem -> 404', async () => {
      await get(`/professor/alunos/${usuarioId.alunoB}/desempenho`, 'profPython').expect(404);
    });

    it('id que não é de aluno ou não existe -> 404', async () => {
      const { rows } = await db.query<{ id: number }>(`SELECT id FROM usuarios WHERE nome = 'admin'`);
      await get(`/professor/alunos/${rows[0].id}/desempenho`, 'profPython').expect(404);
      await get('/professor/alunos/999999/desempenho', 'profPython').expect(404);
    });

    it('id que não é número -> 400', async () => {
      await get('/professor/alunos/abc/desempenho', 'profPython').expect(400);
    });
  });
});
