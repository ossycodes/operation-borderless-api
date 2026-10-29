import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

export const API_PREFIX = 'api/v1';

/**
 * Global HTTP wiring shared by `main.ts` and the e2e tests, so tests run
 * against exactly the same pipes, filters and middleware as production.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  return app;
}
