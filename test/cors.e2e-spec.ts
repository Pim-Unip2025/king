// CORS: só origens de CORS_ORIGINS recebem Access-Control-Allow-Origin.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';

process.env.JWT_SECRET ??= 'segredo-so-para-teste-e2e';
process.env.CORS_ORIGINS = 'https://tronus.vercel.app, http://localhost:5500/';

describe('CORS (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication()) as INestApplication<App>;
    await app.init();
  });

  afterAll(() => app.close());

  it.each(['https://tronus.vercel.app', 'http://localhost:5500'])('libera a origem %s', async (origem) => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', origem)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(origem);
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('não libera origem fora da lista, nem com curinga', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'https://site-malicioso.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
