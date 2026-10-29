import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum FxProviderKind {
  /** Live rates from a public FX API, with fallbacks. */
  Live = 'live',
  /** Fixed, deterministic rate table (used in tests / offline). */
  Static = 'static',
}

/**
 * Environment contract. Validated once at boot so the app refuses to start
 * with a broken configuration instead of failing on the first request.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_URL: string;

  @IsBoolean()
  DB_RUN_MIGRATIONS: boolean = true;

  @IsEnum(FxProviderKind)
  FX_PROVIDER: FxProviderKind = FxProviderKind.Live;

  @IsUrl({ require_tld: false })
  FX_API_URL: string = 'https://open.er-api.com/v6/latest/USD';

  @IsInt()
  @Min(100)
  FX_HTTP_TIMEOUT_MS: number = 3000;

  @IsInt()
  @Min(1)
  FX_CACHE_TTL_SECONDS: number = 300;

  @IsInt()
  @Min(10)
  FX_REFRESH_INTERVAL_SECONDS: number = 300;

  @IsBoolean()
  FX_REFRESH_JOB_ENABLED: boolean = true;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;
}

const toBoolean = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
  if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
  return value;
};

const BOOLEAN_KEYS: (keyof EnvironmentVariables)[] = [
  'DB_RUN_MIGRATIONS',
  'FX_REFRESH_JOB_ENABLED',
];

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const normalised: Record<string, unknown> = { ...config };
  for (const key of BOOLEAN_KEYS) normalised[key] = toBoolean(config[key]);

  const validated = plainToInstance(EnvironmentVariables, normalised, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return validated;
}
