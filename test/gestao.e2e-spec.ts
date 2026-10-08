// Testes e2e das rotas administrativas (PIM-20): questões do professor e
// gestão de usuários do admin — o que o cliente WinForms consome. Rodam
// contra um Postgres de verdade com os scripts do repo Tronus: a regra de
// "exatamente uma correta" e o CHECK do Reino do professor são do banco.
//
// Usuários e questões criados aqui têm o prefixo "e2e_" e são apagados no final.
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
const SENHA = 'Gestao@e2e1';
const ENUNCIADO = `e2e_gestao_${sufixo}`;

type Quem = 'admin' | 'profPython' | 'profCpp' | 'aluno';

const alternativas = (corretas: string[]) =>
  ['A', 'B', 'C', 'D', 'E'].map((letra) => ({ letra, texto: `Opção ${letra}`, correta: corretas.includes(letra) }));

describe('Rotas administrativas de professor e admin (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const token: Record<Quem, string> = {} as never;
  const id: Record<'admin' | 'profPython' | 'profCpp' | 'aluno', number> = {} as never;
  let fasePython: number;
  let faseCpp: number;
  let faseBd: number;
  let reinoPython: number;

  const http = () => request(app.getHttpServer());
  const com = (req: request.Test, quem: Quem) => req.set('Authorization', `Bearer ${token[quem]}`);
  const criar = (fase: number, quem: Quem, corpo: object) => com(http().post(`/fases/${fase}/questoes`), quem).send(corpo);
  const questao = (corretas = ['A'], extra: object = {}) => ({
    enunciado: ENUNCIADO,
    nivel_dificuldade: 'Médio',
    alternativas: alternativas(corretas),
    ...extra,
  });
  const quantasQuestoesDeTeste = async () =>
    (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM questoes WHERE enunciado = $1', [ENUNCIADO])).rows[0].n;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication()) as INestApplication;
    await app.init();
    db = app.get(DatabaseService);

    const primeiraFase = async (reino: string) =>
      (
        await db.query<{ id: number; reino_id: number }>(
          'SELECT f.id, f.reino_id FROM fases f JOIN reinos r ON r.id = f.reino_id WHERE r.nome = $1 ORDER BY f.ordem LIMIT 1',
          [reino],
        )
      ).rows[0];
    const py = await primeiraFase('Python');
    fasePython = py.id;
    reinoPython = py.reino_id;
    faseCpp = (await primeiraFase('C++')).id;
    faseBd = (await primeiraFase('Banco de Dados')).id;

    const hash = await bcrypt.hash(SENHA, 10);
    await db.query(
      `INSERT INTO usuarios (nome, email, celular, senha_hash, papel, professor_reino_id)
       SELECT $1, $2, '12900000002', $3, 'professor', id FROM reinos WHERE nome = 'C++'`,
      [`e2e_gestao_prof_${sufixo}`, `e2e.gestao.prof.${sufixo}@tronus.com`, hash],
    );
    const aluno = await http()
      .post('/auth/register')
      .send({ nome: `e2e_gestao_aluno_${sufixo}`, email: `e2e.gestao.aluno.${sufixo}@tronus.com`, celular: `124${sufixo}1`, senha: SENHA })
      .expect(201);
    token.aluno = aluno.body.access_token;
    id.aluno = aluno.body.usuario.id;

    const login = async (identificador: string, senha: string) => {
      const res = await http().post('/auth/login').send({ identificador, senha }).expect(200);
      return [res.body.access_token as string, res.body.usuario.id as number] as const;
    };
    [token.admin, id.admin] = await login('admin', 'Tronus@adm1');
    [token.profPython, id.profPython] = await login('prof_python', 'Python@prof1');
    [token.profCpp, id.profCpp] = await login(`e2e_gestao_prof_${sufixo}`, SENHA);
  });

  afterAll(async () => {
    if (!app) return;
    await db.query('DELETE FROM questoes WHERE enunciado = $1', [ENUNCIADO]);
    await db.query("DELETE FROM usuarios WHERE nome LIKE 'e2e\\_gestao\\_%'");
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('POST /fases/:id/questoes', () => {
    it('professor cria questão no Reino dele e recebe com `correta`', async () => {
      const res = await criar(fasePython, 'profPython', questao(['C'])).expect(201);
      expect(res.body).toMatchObject({ id: expect.any(Number), fase_id: fasePython, enunciado: ENUNCIADO, nivel_dificuldade: 'Médio' });
      expect(res.body.alternativas.map((a: { letra: string; correta: boolean }) => [a.letra, a.correta])).toEqual([
        ['A', false],
        ['B', false],
        ['C', true],
        ['D', false],
        ['E', false],
      ]);
    });

    it('professor NÃO cria em fase de outro Reino -> 403', async () => {
      await criar(faseCpp, 'profPython', questao()).expect(403);
      await criar(fasePython, 'profCpp', questao()).expect(403);
    });

    it('professor do outro Reino cria no dele; admin cria em qualquer um', async () => {
      await criar(faseCpp, 'profCpp', questao()).expect(201);
      await criar(faseBd, 'admin', questao(['B'])).expect(201);
    });

    it('zero alternativas corretas -> 400 com mensagem útil, e nada é gravado', async () => {
      const antes = await quantasQuestoesDeTeste();
      const res = await criar(fasePython, 'profPython', questao([])).expect(400);
      expect(res.body.message).toBe('A questão precisa ter exatamente uma alternativa correta (marcadas: 0).');
      expect(await quantasQuestoesDeTeste()).toBe(antes);
    });

    it('duas alternativas corretas -> 400 com mensagem útil, e nada é gravado', async () => {
      const antes = await quantasQuestoesDeTeste();
      const res = await criar(fasePython, 'profPython', questao(['A', 'D'])).expect(400);
      expect(res.body.message).toBe('A questão precisa ter exatamente uma alternativa correta (marcadas: 2).');
      expect(await quantasQuestoesDeTeste()).toBe(antes);
    });

    it('letra repetida, só 1 alternativa, nível inválido ou campo extra -> 400', async () => {
      const repetida = questao(['A']);
      repetida.alternativas[1].letra = 'A';
      await criar(fasePython, 'profPython', repetida).expect(400);
      await criar(fasePython, 'profPython', { ...questao(), alternativas: alternativas(['A']).slice(0, 1) }).expect(400);
      await criar(fasePython, 'profPython', questao(['A'], { nivel_dificuldade: 'Impossível' })).expect(400);
      await criar(fasePython, 'profPython', questao(['A'], { fase_id: faseCpp })).expect(400);
      await criar(fasePython, 'profPython', questao(['A'], { enunciado: '   ' })).expect(400);
    });

    it('fase inexistente -> 404; aluno -> 403; sem token -> 401', async () => {
      await criar(999999, 'profPython', questao()).expect(404);
      await criar(fasePython, 'aluno', questao()).expect(403);
      await http().post(`/fases/${fasePython}/questoes`).send(questao()).expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /professor/fases/:id/questoes', () => {
    it('professor lista a fase do Reino dele com `correta`', async () => {
      const res = await com(http().get(`/professor/fases/${fasePython}/questoes`), 'profPython').expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(5);
      for (const q of res.body) {
        expect(q.alternativas.filter((a: { correta: boolean }) => a.correta)).toHaveLength(1);
      }
    });

    it('fase de outro Reino -> 403 (mesmo podendo ler a versão do aluno em /fases)', async () => {
      await com(http().get(`/professor/fases/${faseCpp}/questoes`), 'profPython').expect(403);
      await com(http().get(`/fases/${faseCpp}/questoes`), 'profPython').expect(200);
    });

    it('admin lista qualquer uma; aluno -> 403; fase inexistente -> 404', async () => {
      await com(http().get(`/professor/fases/${faseCpp}/questoes`), 'admin').expect(200);
      await com(http().get(`/professor/fases/${fasePython}/questoes`), 'aluno').expect(403);
      await com(http().get('/professor/fases/999999/questoes'), 'profPython').expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('DELETE /questoes/:id', () => {
    it('professor de outro Reino -> 403; aluno -> 403', async () => {
      const { rows } = await db.query<{ id: number }>(
        'SELECT id FROM questoes WHERE enunciado = $1 AND fase_id = $2',
        [ENUNCIADO, fasePython],
      );
      await com(http().delete(`/questoes/${rows[0].id}`), 'profCpp').expect(403);
      await com(http().delete(`/questoes/${rows[0].id}`), 'aluno').expect(403);
    });

    it('exclui e informa quantas respostas de aluno foram junto', async () => {
      // O aluno responde a fase de Banco de Dados (só tem a questão criada aqui).
      await com(http().post('/personagens'), 'aluno').send({ nome: 'Gestor', genero: 'male', avatar: 'img/masc3.png' }).expect(201);
      const { rows } = await db.query<{ questao_id: number; alt: number }>(
        `SELECT q.id AS questao_id, min(a.id) AS alt FROM questoes q JOIN alternativas a ON a.questao_id = q.id
          WHERE q.fase_id = $1 GROUP BY q.id`,
        [faseBd],
      );
      expect(rows).toHaveLength(1);
      await com(http().post(`/fases/${faseBd}/responder`), 'aluno')
        .send({ respostas: [{ questaoId: rows[0].questao_id, alternativaId: rows[0].alt }] })
        .expect(200);

      const res = await com(http().delete(`/questoes/${rows[0].questao_id}`), 'admin').expect(200);
      expect(res.body).toEqual({ mensagem: 'Questão excluída.', questao_id: rows[0].questao_id, respostas_apagadas: 1 });

      const sobrou = await db.query('SELECT 1 FROM alternativas WHERE questao_id = $1', [rows[0].questao_id]);
      expect(sobrou.rows).toHaveLength(0);
    });

    it('professor exclui questão do Reino dele; de novo -> 404', async () => {
      const { rows } = await db.query<{ id: number }>(
        'SELECT id FROM questoes WHERE enunciado = $1 AND fase_id = $2',
        [ENUNCIADO, fasePython],
      );
      const res = await com(http().delete(`/questoes/${rows[0].id}`), 'profPython').expect(200);
      expect(res.body.respostas_apagadas).toBe(0);
      await com(http().delete(`/questoes/${rows[0].id}`), 'profPython').expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /admin/estatisticas', () => {
    it('números batem com o banco', async () => {
      const res = await com(http().get('/admin/estatisticas'), 'admin').expect(200);
      const conta = async (sql: string) => (await db.query<{ n: number }>(sql)).rows[0].n;
      expect(res.body).toMatchObject({
        usuarios: await conta('SELECT count(*)::int AS n FROM usuarios'),
        alunos: await conta(`SELECT count(*)::int AS n FROM usuarios WHERE papel = 'aluno'`),
        professores: await conta(`SELECT count(*)::int AS n FROM usuarios WHERE papel = 'professor'`),
        admins: await conta(`SELECT count(*)::int AS n FROM usuarios WHERE papel = 'admin'`),
        personagens: await conta('SELECT count(*)::int AS n FROM personagens'),
        questoes: await conta('SELECT count(*)::int AS n FROM questoes'),
        respostas: await conta('SELECT count(*)::int AS n FROM respostas_usuario'),
      });
      expect(typeof res.body.taxa_acerto).toBe('number');
      expect(Object.keys(res.body.personagens_por_titulo).sort()).toEqual(['Cavaleiro', 'Duque', 'Plebeu', 'Rei']);
      const somaTitulos = Object.values(res.body.personagens_por_titulo as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(somaTitulos).toBe(res.body.personagens);
    });

    it('professor e aluno -> 403', async () => {
      await com(http().get('/admin/estatisticas'), 'profPython').expect(403);
      await com(http().get('/admin/estatisticas'), 'aluno').expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /admin/usuarios', () => {
    it('lista todos, sem senha, com o nome do Reino do professor', async () => {
      const res = await com(http().get('/admin/usuarios'), 'admin').expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/senha|\$2[aby]\$|celular/);
      const prof = res.body.find((u: { nome: string }) => u.nome === 'prof_python');
      expect(prof).toMatchObject({ papel: 'professor', professor_reino_id: reinoPython, reino_nome: 'Python', personagem_id: null });
      const aluno = res.body.find((u: { id: number }) => u.id === id.aluno);
      expect(aluno).toMatchObject({ papel: 'aluno', professor_reino_id: null, personagem_id: expect.any(Number) });
    });

    it('filtra por papel; papel inválido -> 400', async () => {
      const res = await com(http().get('/admin/usuarios?papel=professor'), 'admin').expect(200);
      expect(res.body.every((u: { papel: string }) => u.papel === 'professor')).toBe(true);
      await com(http().get('/admin/usuarios?papel=rei'), 'admin').expect(400);
    });

    it('professor -> 403', async () => {
      await com(http().get('/admin/usuarios'), 'profPython').expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /admin/usuarios/:id/reino', () => {
    it('vincula professor a outro Reino, e a regra de acesso muda na hora', async () => {
      const res = await com(http().patch(`/admin/usuarios/${id.profCpp}/reino`), 'admin').send({ reino_id: reinoPython }).expect(200);
      expect(res.body).toMatchObject({ id: id.profCpp, papel: 'professor', professor_reino_id: reinoPython });
      expect(JSON.stringify(res.body)).not.toMatch(/senha/);
      await com(http().get(`/professor/fases/${fasePython}/questoes`), 'profCpp').expect(200);
    });

    it('vincular Reino a aluno ou admin -> 400 (CHECK do banco), sem alterar nada', async () => {
      const aluno = await com(http().patch(`/admin/usuarios/${id.aluno}/reino`), 'admin').send({ reino_id: reinoPython }).expect(400);
      expect(aluno.body.message).toBe('Professor precisa ter um Reino; aluno e admin não podem ter Reino.');
      await com(http().patch(`/admin/usuarios/${id.admin}/reino`), 'admin').send({ reino_id: reinoPython }).expect(400);
      const { rows } = await db.query('SELECT professor_reino_id FROM usuarios WHERE id = $1', [id.aluno]);
      expect(rows[0].professor_reino_id).toBeNull();
    });

    it('Reino inexistente -> 400; usuário inexistente -> 404; corpo inválido -> 400', async () => {
      const res = await com(http().patch(`/admin/usuarios/${id.profCpp}/reino`), 'admin').send({ reino_id: 999999 }).expect(400);
      expect(res.body.message).toBe('Reino não encontrado.');
      await com(http().patch('/admin/usuarios/999999/reino'), 'admin').send({ reino_id: reinoPython }).expect(404);
      await com(http().patch(`/admin/usuarios/${id.profCpp}/reino`), 'admin').send({ reino_id: 'Python' }).expect(400);
      await com(http().patch(`/admin/usuarios/${id.profCpp}/reino`), 'admin').send({}).expect(400);
    });

    it('professor não troca o próprio Reino -> 403', async () => {
      await com(http().patch(`/admin/usuarios/${id.profPython}/reino`), 'profPython').send({ reino_id: reinoPython }).expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('DELETE /admin/usuarios/:id', () => {
    it('professor e admin são protegidos -> 403', async () => {
      await com(http().delete(`/admin/usuarios/${id.profCpp}`), 'admin').expect(403);
      await com(http().delete(`/admin/usuarios/${id.admin}`), 'admin').expect(403);
    });

    it('só admin exclui -> professor e aluno recebem 403', async () => {
      await com(http().delete(`/admin/usuarios/${id.aluno}`), 'profPython').expect(403);
      await com(http().delete(`/admin/usuarios/${id.aluno}`), 'aluno').expect(403);
    });

    it('exclui aluno e diz quantos registros foram junto pelo CASCADE', async () => {
      // O aluno tem personagem e jogou: responde uma fase de Python agora.
      const { rows: gabarito } = await db.query<{ questao_id: number; alt: number }>(
        `SELECT q.id AS questao_id, min(a.id) AS alt FROM questoes q JOIN alternativas a ON a.questao_id = q.id
          WHERE q.fase_id = $1 GROUP BY q.id`,
        [fasePython],
      );
      await com(http().post(`/fases/${fasePython}/responder`), 'aluno')
        .send({ respostas: gabarito.map((g) => ({ questaoId: g.questao_id, alternativaId: g.alt })) })
        .expect(200);

      const { rows: antes } = await db.query<{ progresso: number; respostas: number }>(
        `SELECT (SELECT count(*)::int FROM progresso_fases pf JOIN personagens p ON p.id = pf.personagem_id WHERE p.usuario_id = $1) AS progresso,
                (SELECT count(*)::int FROM respostas_usuario ru JOIN personagens p ON p.id = ru.personagem_id WHERE p.usuario_id = $1) AS respostas`,
        [id.aluno],
      );
      expect(antes[0].respostas).toBe(gabarito.length); // a resposta da questão excluída antes já foi junto com ela

      const res = await com(http().delete(`/admin/usuarios/${id.aluno}`), 'admin').expect(200);
      expect(res.body).toEqual({
        mensagem: 'Usuário excluído. Esta ação não pode ser desfeita.',
        usuario_id: id.aluno,
        apagados: { usuarios: 1, personagens: 1, progresso_fases: antes[0].progresso, respostas_usuario: antes[0].respostas },
      });

      const { rows } = await db.query('SELECT 1 FROM personagens WHERE usuario_id = $1', [id.aluno]);
      expect(rows).toHaveLength(0);
      await com(http().get('/personagens/me'), 'aluno').expect(404);
    });

    it('de novo -> 404; id inválido -> 400', async () => {
      await com(http().delete(`/admin/usuarios/${id.aluno}`), 'admin').expect(404);
      await com(http().delete('/admin/usuarios/abc'), 'admin').expect(400);
    });
  });
});
