import './openapi-env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { buildOpenApiDocument } from '../docs/swagger';

/**
 * Writes the OpenAPI document to docs/openapi.json without needing Postgres
 * or Redis: Nest's preview mode builds the module graph and route metadata
 * but never instantiates providers (so no connections are opened).
 *
 *   yarn openapi:export
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });
  configureApp(app);

  const target = resolve(process.cwd(), 'docs', 'openapi.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`,
  );
  await app.close();
  console.log(`OpenAPI spec written to ${target}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
