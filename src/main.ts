import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { enabledLogLevels } from './config/log-levels';
import { buildOpenApiDocument } from './docs/swagger';

async function bootstrap(): Promise<void> {
  // Buffer boot logs until LOG_LEVEL (validated config) is known.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  app.useLogger(enabledLogLevels(config.logLevel));
  configureApp(app, { trustProxyHops: config.trustProxyHops });

  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  const { port } = config;
  await app.listen(port);
  Logger.log(
    `Harmattan API listening on :${port} (docs at /docs)`,
    'Bootstrap',
  );
}

void bootstrap();
