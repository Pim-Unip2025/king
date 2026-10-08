import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ErrosFilter } from './comum/erros.filter.js';

// Configuração global compartilhada entre main.ts e os testes e2e, para o
// teste rodar a API exatamente como ela sobe em produção.
export function configurarApp(app: INestApplication) {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Erro de validação nunca ecoa o valor recebido — senão a senha
      // voltaria na resposta de um 400.
      validationError: { target: false, value: false },
    }),
  );

  // Todo erro sai no formato { statusCode, message, error, timestamp, path },
  // sem stack nem SQL. Erro do Postgres vira 400/409 quando é culpa do dado.
  app.useGlobalFilters(new ErrosFilter());

  // CORS: só as origens listadas em CORS_ORIGINS (separadas por vírgula)
  // podem chamar a API pelo navegador. Nunca '*'. Mobile e Desktop não são
  // navegador e não passam por CORS, então não precisam estar na lista.
  const origens = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origem) => origem.trim().replace(/\/$/, ''))
    .filter(Boolean);
  app.enableCors({
    origin: origens.length > 0 ? origens : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  return app;
}
