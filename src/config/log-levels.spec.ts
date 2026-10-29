import 'reflect-metadata';
import { validateEnv } from './env.validation';
import { enabledLogLevels } from './log-levels';

const REQUIRED = {
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
};

describe('enabledLogLevels', () => {
  it('enables the threshold and everything more severe', () => {
    expect(enabledLogLevels('warn')).toEqual(['fatal', 'error', 'warn']);
    expect(enabledLogLevels('verbose')).toHaveLength(6);
    expect(enabledLogLevels('fatal')).toEqual(['fatal']);
  });
});

describe('LOG_LEVEL', () => {
  it('defaults to log', () => {
    expect(validateEnv(REQUIRED).LOG_LEVEL).toBe('log');
  });

  it('accepts any Nest log level', () => {
    expect(validateEnv({ ...REQUIRED, LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe(
      'debug',
    );
  });

  it('refuses to boot with an unknown level', () => {
    expect(() => validateEnv({ ...REQUIRED, LOG_LEVEL: 'loud' })).toThrow(
      /LOG_LEVEL/,
    );
  });
});
