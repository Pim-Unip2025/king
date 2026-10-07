import { INestApplication, ValidationPipe } from '@nestjs/common';

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
  return app;
}
