import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Versão do swagger-ui-dist que o @nestjs/swagger instala. Os arquivos da
// interface vêm do CDN: na Vercel a API é uma função serverless, e os .css/.js
// estáticos do pacote não vão junto no bundle, então /docs abriria em branco.
const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0';

// Documentação interativa da API:
//   /docs       interface do Swagger UI
//   /docs-json  especificação OpenAPI em JSON (dá para importar no Postman/Insomnia)
export function configurarDocs(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Tronus API')
    .setDescription(
      'API REST do Tronus (PIM IV — UNIP). Autenticação por JWT: faça login em ' +
        '`POST /auth/login`, clique em **Authorize** e cole o `access_token`.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const documento = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, documento, {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'Tronus API — documentação',
    customCssUrl: `${SWAGGER_UI_CDN}/swagger-ui.css`,
    customJs: [`${SWAGGER_UI_CDN}/swagger-ui-bundle.js`, `${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js`],
    swaggerOptions: { persistAuthorization: true },
  });

  return app;
}
