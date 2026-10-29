import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, RedisModule],
  controllers: [HealthController],
})
export class AppModule {}
