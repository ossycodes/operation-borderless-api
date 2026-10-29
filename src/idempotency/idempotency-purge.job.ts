import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { AppConfigService } from '../config/app-config.service';
import { IdempotencyService } from './idempotency.service';

export const IDEMPOTENCY_QUEUE = 'idempotency';
const SCHEDULER_ID = 'idempotency-purge';
const JOB_NAME = 'purge-expired-keys';
const PURGE_EVERY_MS = 60 * 60 * 1000;

/**
 * Hourly purge of expired idempotency keys. Correctness never depends on it
 * (expired keys are treated as unused when read); it only keeps the table
 * from growing forever. Like the FX refresh, BullMQ runs it once across the
 * cluster and retries failures.
 */
@Injectable()
export class IdempotencyPurgeScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdempotencyPurgeScheduler.name);

  constructor(
    @InjectQueue(IDEMPOTENCY_QUEUE) private readonly queue: Queue,
    private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.idempotency.purgeJobEnabled) {
      await this.queue.removeJobScheduler(SCHEDULER_ID);
      return;
    }
    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { every: PURGE_EVERY_MS },
      {
        name: JOB_NAME,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 24,
          removeOnFail: 50,
        },
      },
    );
    this.logger.log(
      `Idempotency keys expire after ${this.config.idempotency.keyTtlHours}h; purged hourly`,
    );
  }
}

@Processor(IDEMPOTENCY_QUEUE)
export class IdempotencyPurgeProcessor extends WorkerHost {
  private readonly logger = new Logger(IdempotencyPurgeProcessor.name);

  constructor(private readonly idempotency: IdempotencyService) {
    super();
  }

  async process(job: Job): Promise<{ deleted: number }> {
    const deleted = await this.idempotency.purgeExpired();
    this.logger.log(
      `Job ${job.id}: purged ${deleted} expired idempotency keys`,
    );
    return { deleted };
  }
}
