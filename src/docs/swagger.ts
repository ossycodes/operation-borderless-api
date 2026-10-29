import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Harmattan API')
    .setDescription(
      'Stablecoin-powered cross-border payments & FX sandbox: multi-currency ' +
        'wallets (cNGN, cGHS, cXAF, USDx, EURx), deposits, swaps, transfers, ' +
        'transaction history and live FX rates.\n\n' +
        'All monetary amounts are **decimal strings** (never JSON numbers) to ' +
        'avoid floating-point loss. Mutating endpoints require an ' +
        '`Idempotency-Key` header.',
    )
    .setVersion('1.0.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}
