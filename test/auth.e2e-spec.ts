// Testes e2e do módulo auth. Rodam contra um Postgres DE VERDADE com o schema
// e os seeds do repo Tronus (db/01, 02, 02b, 03, 04) — nada de mock de banco.
//
//   DATABASE_URL=postgresql://... JWT_SECRET=qualquer npm run test:e2e
//
// Os usuários criados aqui têm o prefixo "e2e_" e são apagados no final.
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';
import { DatabaseService } from '../src/database/database.service';

process.env.JWT_SECRET ??= 'segredo-so-para-teste-e2e';
process.env.JWT_EXPIRES_IN = '3600';
process.env.SIMULAR_SMS = 'true';

const SEED_ADMIN = { identificador: 'admin', senha: 'Tronus@adm1' };
const SEED_PROF = { identificador: 'prof_python', senha: 'Python@prof1' };

const sufixo = Date.now().toString().slice(-7);
const ALUNO = {
  nome: `e2e_aluno_${sufixo}`,
  email: `E2E.Aluno.${sufixo}@Tronus.com`, // maiúsculas de propósito
  celular: `(12) 9${sufixo.padStart(8, '0').slice(0, 8)}`,
  senha: 'Aluno@e2e1',
};
const NOVA_SENHA = 'Trocada@e2e2';
const SENHAS = [SEED_ADMIN.senha, SEED_PROF.senha, ALUNO.senha, NOVA_SENHA];

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let db: DatabaseService;
  let jwt: JwtService;
  const saida: string[] = [];
  const escritaOriginal = { out: process.stdout.write, err: process.stderr.write };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication()) as INestApplication<App>;
    await app.init();
    db = app.get(DatabaseService);
    jwt = app.get(JwtService);

    // Captura tudo que for para o console durante os testes, para provar que
    // nenhuma senha aparece em log.
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
    await db.query("DELETE FROM usuarios WHERE nome LIKE 'e2e\\_%'");
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Nenhuma resposta pode conter senha, nem em texto puro nem em hash. */
  const semSenha = (body: unknown) => {
    const json = JSON.stringify(body);
    for (const senha of SENHAS) expect(json).not.toContain(senha);
    expect(json).not.toMatch(/senha_hash|\$2[aby]\$/);
  };

  describe('POST /auth/login com os usuários dos seeds', () => {
    it.each([
      [SEED_ADMIN, 'admin'],
      [SEED_PROF, 'professor'],
    ])('%o autentica e recebe token válido', async (credenciais, papel) => {
      const res = await http().post('/auth/login').send(credenciais).expect(200);

      expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, usuario: { papel } });
      const payload = jwt.verify<{ sub: string; papel: string; exp: number; iat: number }>(res.body.access_token);
      expect(payload.sub).toBe(String(res.body.usuario.id));
      expect(payload.papel).toBe(papel);
      expect(payload.exp - payload.iat).toBe(3600);
      semSenha(res.body);
    });

    it('aceita e-mail no lugar do nome, sem diferenciar maiúsculas', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ identificador: 'Prof.Python@Tronus.com', senha: SEED_PROF.senha })
        .expect(200);
      expect(res.body.usuario.nome).toBe('prof_python');
    });

    it('senha errada e usuário inexistente dão o mesmo 401', async () => {
      const errada = await http().post('/auth/login').send({ identificador: 'admin', senha: 'Errada@123' }).expect(401);
      const inexistente = await http()
        .post('/auth/login')
        .send({ identificador: 'ninguem_aqui', senha: 'Errada@123' })
        .expect(401);
      expect(errada.body.message).toBe(inexistente.body.message);
    });
  });

  describe('POST /auth/register', () => {
    let tokenAluno: string;

    it('cadastra aluno, normaliza e-mail/celular e já devolve token', async () => {
      const res = await http().post('/auth/register').send(ALUNO).expect(201);

      expect(res.body.usuario).toMatchObject({
        nome: ALUNO.nome,
        email: ALUNO.email.toLowerCase(),
        papel: 'aluno',
        professor_reino_id: null,
      });
      semSenha(res.body);
      tokenAluno = res.body.access_token;

      const { rows } = await db.query('SELECT celular, senha_hash FROM usuarios WHERE nome = $1', [ALUNO.nome]);
      expect(rows[0].celular).toMatch(/^\d{11}$/);
      expect(rows[0].senha_hash).toMatch(/^\$2[aby]\$10\$/); // bcrypt custo 10
    });

    it('o token do cadastro abre GET /auth/me', async () => {
      const res = await http().get('/auth/me').set('Authorization', `Bearer ${tokenAluno}`).expect(200);
      expect(res.body.nome).toBe(ALUNO.nome);
      semSenha(res.body);
    });

    it.each([
      ['nome duplicado', { nome: ALUNO.nome, email: 'outro1@x.com', celular: '12988887771' }, /Nome/],
      ['e-mail duplicado (outra caixa)', { nome: 'e2e_outro1', email: ALUNO.email.toUpperCase(), celular: '12988887772' }, /E-mail/],
      ['e-mail do seed', { nome: 'e2e_outro2', email: 'admin@tronus.com', celular: '12988887773' }, /E-mail/],
      ['celular duplicado', { nome: 'e2e_outro3', email: 'outro3@x.com', celular: ALUNO.celular }, /Celular/],
    ])('rejeita %s com 409', async (_caso, campos, mensagem) => {
      const res = await http()
        .post('/auth/register')
        .send({ ...campos, senha: 'Valida@123' })
        .expect(409);
      expect(res.body.message).toMatch(mensagem);
    });

    it.each(['semmaiuscula@1', 'SEMMINUSCULA@1', 'SemNumero@!', 'SemSimbolo123', '123456'])('rejeita senha fraca "%s" com 400', async (senha) => {
      const res = await http()
        .post('/auth/register')
        .send({ nome: 'e2e_fraca', email: 'fraca@x.com', celular: '12988887774', senha })
        .expect(400);
      expect(res.body.message.join(' ')).toMatch(/mínimo 8 caracteres/);
      semSenha(res.body);
      expect(JSON.stringify(res.body)).not.toContain(senha);
    });

    it('rejeita senha com menos de 8 caracteres', async () => {
      await http()
        .post('/auth/register')
        .send({ nome: 'e2e_curta', email: 'curta@x.com', celular: '12988887775', senha: 'Ab@1234' })
        .expect(400);
    });

    it.each(['123', '129999999999', 'abcdefghij', ''])('rejeita celular inválido "%s" com 400', async (celular) => {
      const res = await http()
        .post('/auth/register')
        .send({ nome: 'e2e_cel', email: 'cel@x.com', celular, senha: 'Valida@123' })
        .expect(400);
      expect(res.body.message.join(' ')).toMatch(/Celular inválido/);
    });

    it.each(['sem-arroba', 'a@b', 'a b@c.com'])('rejeita e-mail inválido "%s" com 400', async (email) => {
      const res = await http()
        .post('/auth/register')
        .send({ nome: 'e2e_mail', email, celular: '12988887776', senha: 'Valida@123' })
        .expect(400);
      expect(res.body.message.join(' ')).toMatch(/e-mail/i);
    });

    it('não deixa o cliente escolher o papel', async () => {
      await http()
        .post('/auth/register')
        .send({ nome: 'e2e_hacker', email: 'h@x.com', celular: '12988887777', senha: 'Valida@123', papel: 'admin' })
        .expect(400);
    });
  });

  describe('expiração do token', () => {
    it('token do login para de valer depois de JWT_EXPIRES_IN segundos', async () => {
      const login = await http().post('/auth/login').send(SEED_ADMIN).expect(200);
      const token = login.body.access_token;

      await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

      // Adianta o relógio 1h + 1s — o jsonwebtoken lê a hora de Date.now().
      const agora = Date.now();
      const relogio = jest.spyOn(Date, 'now').mockReturnValue(agora + 3601 * 1000);
      try {
        const res = await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
        expect(res.body.message).toMatch(/expirado/);
      } finally {
        relogio.mockRestore();
      }
    });

    it('rejeita token ausente, adulterado ou com outro segredo', async () => {
      const login = await http().post('/auth/login').send(SEED_PROF).expect(200);
      const [h, p, s] = login.body.access_token.split('.');
      const outroSegredo = jwt.sign({ sub: '1', papel: 'admin' }, { secret: 'outro-segredo' });
      const papelForjado = Buffer.from(JSON.stringify({ sub: '1', papel: 'admin' })).toString('base64url');

      await http().get('/auth/me').expect(401);
      await http().get('/auth/me').set('Authorization', `Bearer ${h}.${papelForjado}.${s}`).expect(401);
      await http().get('/auth/me').set('Authorization', `Bearer ${outroSegredo}`).expect(401);
      await http().get('/auth/me').set('Authorization', `Bearer ${h}.${p}.${s}`).expect(200);
    });
  });

  describe('POST /auth/forgot-password + /auth/reset-password', () => {
    it('celular desconhecido dá 404', async () => {
      await http().post('/auth/forgot-password').send({ celular: '12900000000' }).expect(404);
    });

    it('não redefine senha de admin nem de professor', async () => {
      await http().post('/auth/forgot-password').send({ celular: '00000000000' }).expect(403);
      await http().post('/auth/forgot-password').send({ celular: '11111111111' }).expect(403);
    });

    it('fluxo completo: código errado falha, certo troca a senha, token não reutiliza', async () => {
      const esqueci = await http().post('/auth/forgot-password').send({ celular: ALUNO.celular }).expect(200);
      const { reset_token: resetToken, codigo } = esqueci.body;
      expect(codigo).toMatch(/^\d{6}$/);
      // O código não pode estar legível dentro do token.
      expect(Buffer.from(resetToken.split('.')[1], 'base64url').toString()).not.toContain(codigo);

      // resetToken não serve como login.
      await http().get('/auth/me').set('Authorization', `Bearer ${resetToken}`).expect(401);

      const errado = codigo === '000000' ? '000001' : '000000';
      await http()
        .post('/auth/reset-password')
        .send({ resetToken, codigo: errado, novaSenha: NOVA_SENHA })
        .expect(400);

      const ok = await http().post('/auth/reset-password').send({ resetToken, codigo, novaSenha: NOVA_SENHA }).expect(200);
      semSenha(ok.body);

      await http().post('/auth/login').send({ identificador: ALUNO.nome, senha: ALUNO.senha }).expect(401);
      await http().post('/auth/login').send({ identificador: ALUNO.nome, senha: NOVA_SENHA }).expect(200);

      // Uso único: a senha mudou, o mesmo token morre.
      await http()
        .post('/auth/reset-password')
        .send({ resetToken, codigo, novaSenha: 'Outra@senha3' })
        .expect(400);
    });

    it('resetToken expira em 10 minutos', async () => {
      const esqueci = await http().post('/auth/forgot-password').send({ celular: ALUNO.celular }).expect(200);
      const relogio = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 601 * 1000);
      try {
        await http()
          .post('/auth/reset-password')
          .send({ resetToken: esqueci.body.reset_token, codigo: esqueci.body.codigo, novaSenha: 'Outra@senha3' })
          .expect(400);
      } finally {
        relogio.mockRestore();
      }
    });
  });

  it('nenhuma senha apareceu no console durante os testes', () => {
    const log = saida.join('');
    for (const senha of SENHAS) expect(log).not.toContain(senha);
  });
});
