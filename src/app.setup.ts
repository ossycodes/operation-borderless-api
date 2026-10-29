import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { requestLoggingMiddleware } from './common/middleware/request-logging.middleware';

export const API_PREFIX = 'api/v1';

export interface AppOptions {
  /**
   * Reverse proxies in front of the API. Lets `req.ip` (and therefore rate
   * limiting) see the real client instead of the load balancer.
   */
  trustProxyHops?: number;
}

/**
 * Global HTTP wiring shared by `main.ts` and the e2e tests, so tests run
 * against exactly the same pipes, filters and middleware as production.
 */
export function configureApp(
  app: INestApplication,
  options: AppOptions = {},
): INestApplication {
  if (options.trustProxyHops) {
    (app as NestExpressApplication).set('trust proxy', options.trustProxyHops);
  }
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);
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
