// Testes e2e da autorização por papel (PIM-16). Rodam contra um Postgres de
// verdade com o schema e os seeds do repo Tronus, como o auth.e2e-spec.ts.
//
// As rotas de Reinos/questões/progresso ainda não existem (PIM-17 a PIM-20),
// então este teste monta um controller SÓ DE TESTE com o mesmo formato que
// elas vão ter, usando os guards globais e o AcessoService reais. Quando as
// rotas de verdade chegarem, os testes delas repetem estes cenários.
//
// Usuários criados aqui têm o prefixo "e2e_" e são apagados no final.
import { Controller, Get, INestApplication, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { AcessoService } from '../src/auth/acesso.service.js';
import { Public, Roles, UsuarioAtual } from '../src/auth/auth.decorators.js';
import { AuthModule } from '../src/auth/auth.module.js';
import type { UsuarioAutenticado } from '../src/auth/auth.types.js';
import { DatabaseService } from '../src/database/database.service.js';

process.env.JWT_SECRET ??= 'segredo-so-para-teste-e2e';
process.env.JWT_EXPIRES_IN = '3600';

@Controller('teste-autz')
class RotasDeTesteController {
  constructor(private readonly acesso: AcessoService) {}

  @Public()
  @Get('publica')
  publica() {
    return { ok: true };
  }

  @Get('logado')
  logado(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return usuario;
  }

  @Roles('admin')
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Roles('professor', 'admin')
  @Patch('questoes/:id')
  async editarQuestao(@UsuarioAtual() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    await this.acesso.garantirQuestao(usuario, id);
    return { ok: true };
  }

  @Roles('professor', 'admin')
  @Post('fases/:id/questoes')
  async criarQuestao(@UsuarioAtual() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    await this.acesso.garantirFase(usuario, id);
    return { ok: true };
  }

  @Get('progresso/:personagemId')
  async lerProgresso(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('personagemId', ParseIntPipe) personagemId: number,
  ) {
    await this.acesso.garantirPersonagem(usuario, personagemId, 'leitura');
    return { ok: true };
  }

  @Post('progresso/:personagemId')
  async registrarProgresso(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('personagemId', ParseIntPipe) personagemId: number,
  ) {
    await this.acesso.garantirPersonagem(usuario, personagemId, 'escrita');
    return { ok: true };
  }
}

// Uma tela do PIM III era pública e outra não; aqui vale o contrário: tudo é
// fechado, e só /health e as rotas de login/cadastro/senha ficam abertas.
const ROTAS_PUBLICAS_REAIS: [string, string][] = [
  ['get', '/health'],
  ['post', '/auth/login'],
  ['post', '/auth/register'],
  ['post', '/auth/forgot-password'],
  ['post', '/auth/reset-password'],
];

const sufixo = Date.now().toString().slice(-7);
const SENHA = 'Autz@e2e1';

describe('Autorização por papel (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let jwt: JwtService;

  const token: Record<'admin' | 'profPython' | 'profCpp' | 'alunoA' | 'alunoB', string> = {} as never;
  let personagemA: number;
  let personagemB: number;
  let questaoPython: number;
  let questaoCpp: number;
  let fasePython: number;
  let faseCpp: number;

  const http = () => request(app.getHttpServer());
  const login = async (identificador: string, senha: string) =>
    (await http().post('/auth/login').send({ identificador, senha }).expect(200)).body.access_token as string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      // AuthModule de novo só para o controller de teste enxergar o AcessoService
      // (é o mesmo módulo que o AppModule já importa, não duplica nada).
      imports: [AppModule, AuthModule],
      controllers: [RotasDeTesteController],
    }).compile();
    app = configurarApp(modulo.createNestApplication()) as INestApplication;
    await app.init();
    db = app.get(DatabaseService);
    jwt = app.get(JwtService);

    const id = async (sql: string, params: unknown[] = []) => (await db.query<{ id: number }>(sql, params)).rows[0].id;

    // Uma fase e uma questão em cada Reino (Python vem dos seeds; C++ só tem
    // as fases, então a questão é criada aqui).
    fasePython = await id(`SELECT f.id FROM fases f JOIN reinos r ON r.id = f.reino_id WHERE r.nome = 'Python' ORDER BY f.ordem LIMIT 1`);
    faseCpp = await id(`SELECT f.id FROM fases f JOIN reinos r ON r.id = f.reino_id WHERE r.nome = 'C++' ORDER BY f.ordem LIMIT 1`);
    questaoPython = await id('SELECT id FROM questoes WHERE fase_id = $1 LIMIT 1', [fasePython]);
    questaoCpp = await id(`INSERT INTO questoes (fase_id, enunciado) VALUES ($1, 'e2e_questao_cpp') RETURNING id`, [faseCpp]);

    // Professor do Reino C++, para provar que prof_python não mexe nele.
    const hash = await bcrypt.hash(SENHA, 10);
    await db.query(
      `INSERT INTO usuarios (nome, email, celular, senha_hash, papel, professor_reino_id)
       SELECT $1, $2, '12900000000', $3, 'professor', id FROM reinos WHERE nome = 'C++'`,
      [`e2e_prof_cpp_${sufixo}`, `e2e.prof.cpp.${sufixo}@tronus.com`, hash],
    );

    // Dois alunos, cada um com seu personagem.
    for (const [letra, digito] of [['a', '1'], ['b', '2']] as const) {
      await http()
        .post('/auth/register')
        .send({
          nome: `e2e_aluno_${letra}_${sufixo}`,
          email: `e2e.${letra}.${sufixo}@tronus.com`,
          celular: `129${sufixo}${digito}`, // 11 dígitos, único por execução
          senha: SENHA,
        })
        .expect(201);
    }
    const personagem = (letra: string) =>
      id(
        `INSERT INTO personagens (usuario_id, nome, genero, avatar)
         SELECT id, 'e2e', 'masculino', 'avatar.png' FROM usuarios WHERE nome = $1 RETURNING id`,
        [`e2e_aluno_${letra}_${sufixo}`],
      );
    personagemA = await personagem('a');
    personagemB = await personagem('b');

    token.admin = await login('admin', 'Tronus@adm1');
    token.profPython = await login('prof_python', 'Python@prof1');
    token.profCpp = await login(`e2e_prof_cpp_${sufixo}`, SENHA);
    token.alunoA = await login(`e2e_aluno_a_${sufixo}`, SENHA);
    token.alunoB = await login(`e2e_aluno_b_${sufixo}`, SENHA);
  });

  afterAll(async () => {
    if (!app) return;
    await db.query("DELETE FROM questoes WHERE enunciado = 'e2e_questao_cpp'");
    await db.query("DELETE FROM usuarios WHERE nome LIKE 'e2e\\_%'"); // personagens vão em cascata
    await app.close();
  });

  const comToken = (metodo: 'get' | 'post' | 'patch', rota: string, quem: keyof typeof token) =>
    http()[metodo](rota).set('Authorization', `Bearer ${token[quem]}`);

  // ---------------------------------------------------------------------------
  describe('Critério: rota sem token devolve 401', () => {
    it.each([
      ['get', '/auth/me'],
      ['get', '/teste-autz/logado'],
      ['get', '/teste-autz/admin'],
      ['patch', '/teste-autz/questoes/1'],
      ['get', '/teste-autz/progresso/1'],
    ] as const)('%s %s sem Authorization -> 401', async (metodo, rota) => {
      const res = await http()[metodo](rota).expect(401);
      expect(res.body.message).toBe('Token ausente.');
    });

    it('token assinado com outro segredo -> 401', async () => {
      const falso = await jwt.signAsync({ sub: '1', papel: 'admin' }, { secret: 'outro-segredo' });
      await http().get('/teste-autz/admin').set('Authorization', `Bearer ${falso}`).expect(401);
    });

    it('token expirado -> 401', async () => {
      const expirado = await jwt.signAsync({ sub: '1', papel: 'admin' }, { expiresIn: -10 });
      await http().get('/teste-autz/admin').set('Authorization', `Bearer ${expirado}`).expect(401);
    });

    it('token com papel inventado -> 401', async () => {
      const inventado = await jwt.signAsync({ sub: '1', papel: 'superadmin' });
      await http().get('/teste-autz/logado').set('Authorization', `Bearer ${inventado}`).expect(401);
    });

    it('esquema diferente de Bearer -> 401', async () => {
      await http().get('/teste-autz/logado').set('Authorization', `Basic ${token.admin}`).expect(401);
    });

    it.each(ROTAS_PUBLICAS_REAIS)('%s %s continua público (não devolve 401 por falta de token)', async (metodo, rota) => {
      const res = await (http() as unknown as Record<string, (r: string) => request.Test>)[metodo](rota).send({});
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('@Public() libera rota sem token', async () => {
      await http().get('/teste-autz/publica').expect(200);
    });

    it('logado sem @Roles passa e recebe { id, papel } do token', async () => {
      const res = await comToken('get', '/teste-autz/logado', 'alunoA').expect(200);
      expect(res.body.papel).toBe('aluno');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Critério: aluno em rota de admin devolve 403', () => {
    it('aluno -> 403', async () => {
      const res = await comToken('get', '/teste-autz/admin', 'alunoA').expect(403);
      expect(res.body.message).toBe('Seu perfil não tem acesso a este recurso.');
    });

    it('professor -> 403', async () => {
      await comToken('get', '/teste-autz/admin', 'profPython').expect(403);
    });

    it('admin -> 200', async () => {
      await comToken('get', '/teste-autz/admin', 'admin').expect(200);
    });

    it('aluno em rota de professor -> 403', async () => {
      await comToken('patch', `/teste-autz/questoes/${questaoPython}`, 'alunoA').expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Critério: professor em questão de outro Reino devolve 403', () => {
    it('prof_python edita questão de Python -> 200', async () => {
      await comToken('patch', `/teste-autz/questoes/${questaoPython}`, 'profPython').expect(200);
    });

    it('prof_python edita questão de C++ -> 403', async () => {
      const res = await comToken('patch', `/teste-autz/questoes/${questaoCpp}`, 'profPython').expect(403);
      expect(res.body.message).toBe('Você só pode acessar conteúdo do seu Reino.');
    });

    it('prof de C++ edita questão de Python -> 403', async () => {
      await comToken('patch', `/teste-autz/questoes/${questaoPython}`, 'profCpp').expect(403);
    });

    it('prof_python cria questão em fase de C++ -> 403, e na de Python -> 200', async () => {
      await comToken('post', `/teste-autz/fases/${faseCpp}/questoes`, 'profPython').expect(403);
      await comToken('post', `/teste-autz/fases/${fasePython}/questoes`, 'profPython').expect(201);
    });

    it('admin edita questão de qualquer Reino -> 200', async () => {
      await comToken('patch', `/teste-autz/questoes/${questaoCpp}`, 'admin').expect(200);
      await comToken('patch', `/teste-autz/questoes/${questaoPython}`, 'admin').expect(200);
    });

    it('questão inexistente -> 404', async () => {
      await comToken('patch', '/teste-autz/questoes/999999', 'profPython').expect(404);
    });

    it('trocar o Reino do professor no banco vale na hora, sem novo login', async () => {
      await db.query(
        `UPDATE usuarios SET professor_reino_id = (SELECT id FROM reinos WHERE nome = 'Python') WHERE nome = $1`,
        [`e2e_prof_cpp_${sufixo}`],
      );
      await comToken('patch', `/teste-autz/questoes/${questaoPython}`, 'profCpp').expect(200);
      await comToken('patch', `/teste-autz/questoes/${questaoCpp}`, 'profCpp').expect(403);
      await db.query(
        `UPDATE usuarios SET professor_reino_id = (SELECT id FROM reinos WHERE nome = 'C++') WHERE nome = $1`,
        [`e2e_prof_cpp_${sufixo}`],
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('Critério: aluno lendo progresso de outro aluno devolve 403', () => {
    it('aluno A lê o próprio progresso -> 200', async () => {
      await comToken('get', `/teste-autz/progresso/${personagemA}`, 'alunoA').expect(200);
    });

    it('aluno A lê o progresso do aluno B -> 403', async () => {
      const res = await comToken('get', `/teste-autz/progresso/${personagemB}`, 'alunoA').expect(403);
      expect(res.body.message).toBe('Você só pode acessar os seus próprios dados.');
    });

    it('aluno A registra progresso no personagem do B -> 403', async () => {
      await comToken('post', `/teste-autz/progresso/${personagemB}`, 'alunoA').expect(403);
    });

    it('personagem inexistente dá o mesmo 403 (não revela quais ids existem)', async () => {
      const outro = await comToken('get', `/teste-autz/progresso/${personagemB}`, 'alunoA');
      const inexistente = await comToken('get', '/teste-autz/progresso/999999', 'alunoA');
      expect(inexistente.status).toBe(403);
      // Mesmo status e mesma mensagem; só path e timestamp mudam.
      const semRota = ({ path: _p, timestamp: _t, ...resto }: Record<string, unknown>) => resto;
      expect(semRota(inexistente.body)).toEqual(semRota(outro.body));
    });

    it('professor e admin leem progresso de qualquer aluno, mas não escrevem', async () => {
      await comToken('get', `/teste-autz/progresso/${personagemB}`, 'profPython').expect(200);
      await comToken('get', `/teste-autz/progresso/${personagemB}`, 'admin').expect(200);
      await comToken('post', `/teste-autz/progresso/${personagemB}`, 'admin').expect(403);
    });

    it('personagemDoUsuario devolve o personagem do próprio aluno', async () => {
      const { rows } = await db.query<{ id: number }>('SELECT id FROM usuarios WHERE nome = $1', [`e2e_aluno_a_${sufixo}`]);
      await expect(app.get(AcessoService).personagemDoUsuario(rows[0].id)).resolves.toBe(personagemA);
    });
  });
});
