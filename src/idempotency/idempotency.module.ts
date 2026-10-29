import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKeyEntity } from './idempotency-key.entity';
import {
  IDEMPOTENCY_QUEUE,
  IdempotencyPurgeProcessor,
  IdempotencyPurgeScheduler,
} from './idempotency-purge.job';
import { IdempotencyService } from './idempotency.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IdempotencyKeyEntity]),
    BullModule.registerQueue({ name: IDEMPOTENCY_QUEUE }),
  ],
  providers: [
    IdempotencyService,
    IdempotencyPurgeScheduler,
    IdempotencyPurgeProcessor,
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
