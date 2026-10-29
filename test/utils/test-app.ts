import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { AppOptions, configureApp } from '../../src/app.setup';

export const API = '/api/v1';

export interface TestAppOptions extends AppOptions {
  /** Hook to override providers (e.g. config) before the module compiles. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/** Boots the real AppModule with the same global wiring as production. */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication<App>> {
  const { override = (builder) => builder, ...appOptions } = options;
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: ['error'],
  });
  configureApp(app, appOptions);
  // Listen once on an ephemeral port. Otherwise supertest binds a fresh port
  // per request, which floods the server with listeners under the
  // concurrency tests (MaxListenersExceededWarning).
  await app.listen(0);
  return app;
}

export const uniqueEmail = (): string => `${randomUUID()}@test.local`;

export const uniquePhone = (): string =>
  `+234${Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)}`;
