import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { FxModule } from './fx/fx.module';
import { HealthController } from './health/health.controller';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    FxModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
