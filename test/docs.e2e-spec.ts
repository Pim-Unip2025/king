// Swagger: /docs abre a interface e /docs-json traz a especificação OpenAPI
// com todas as rotas documentadas.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { configurarDocs } from '../src/docs.setup.js';

process.env.JWT_SECRET ??= 'segredo-so-para-teste-e2e';

describe('Docs (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarDocs(configurarApp(modulo.createNestApplication()));
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /docs devolve a interface, com os assets do CDN', async () => {
    const res = await request(app.getHttpServer()).get('/docs').redirects(1).expect(200);
    expect(res.text).toContain('swagger-ui');
    expect(res.text).toContain('cdn.jsdelivr.net/npm/swagger-ui-dist');
  });

  it('GET /docs-json lista todas as rotas com os schemas de entrada e saída', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const spec = res.body;

    expect(Object.keys(spec.paths).sort()).toEqual(
      ['/auth/forgot-password', '/auth/login', '/auth/me', '/auth/register', '/auth/reset-password', '/health'].sort(),
    );
    expect(spec.components.securitySchemes.bearer).toBeDefined();
    expect(spec.paths['/auth/me'].get.security).toEqual([{ bearer: [] }]);

    // Schemas preenchidos (sem o plugin da CLI, que a Vercel não roda)
    expect(Object.keys(spec.components.schemas.RegisterDto.properties)).toEqual(['nome', 'email', 'celular', 'senha']);
    expect(spec.components.schemas.SessaoDto.properties.usuario).toBeDefined();
    expect(spec.paths['/auth/login'].post.responses['200']).toBeDefined();
    expect(spec.paths['/auth/login'].post.responses['401']).toBeDefined();
  });
});
