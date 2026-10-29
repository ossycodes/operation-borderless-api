import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../redis/redis.module';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness/readiness check for API, Postgres and Redis',
  })
  async check(): Promise<{ status: 'ok'; database: 'up'; redis: 'up' }> {
    try {
      await Promise.all([this.dataSource.query('SELECT 1'), this.redis.ping()]);
    } catch {
      throw new ServiceUnavailableException('Dependency check failed');
    }
    return { status: 'ok', database: 'up', redis: 'up' };
  }
}
