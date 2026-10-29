import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { buildOpenApiDocument } from './docs/swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  const { port } = app.get(AppConfigService);
  await app.listen(port);
  Logger.log(
    `Harmattan API listening on :${port} (docs at /docs)`,
    'Bootstrap',
  );
}

void bootstrap();
