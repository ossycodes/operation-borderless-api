import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { AppConfigService } from '../config/app-config.service';
import { FxRatesService } from './fx-rates.service';

export const FX_QUEUE = 'fx';
const SCHEDULER_ID = 'fx-refresh';
const JOB_NAME = 'refresh-rates';

/**
 * Registers a repeatable refresh job. BullMQ earns its place here: with N
 * API replicas the job still runs once per interval cluster-wide (the
 * scheduler is keyed by id in Redis), and a failing provider is retried with
 * exponential backoff instead of being silently skipped until the next tick.
 */
@Injectable()
export class FxRefreshScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(FxRefreshScheduler.name);

  constructor(
    @InjectQueue(FX_QUEUE) private readonly queue: Queue,
    private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { refreshJobEnabled, refreshIntervalSeconds } = this.config.fx;
    if (!refreshJobEnabled) {
      await this.queue.removeJobScheduler(SCHEDULER_ID);
      return;
    }
    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { every: refreshIntervalSeconds * 1000 },
      {
        name: JOB_NAME,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      },
    );
    this.logger.log(`FX refresh scheduled every ${refreshIntervalSeconds}s`);
  }
}

@Processor(FX_QUEUE)
export class FxRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(FxRefreshProcessor.name);

  constructor(private readonly fxRates: FxRatesService) {
    super();
  }

  async process(job: Job): Promise<{ provider: string; asOf: string }> {
    const rates = await this.fxRates.refreshFromProvider();
    this.logger.debug(
      `Job ${job.id}: FX rates refreshed from ${rates.provider}`,
    );
    return { provider: rates.provider, asOf: rates.asOf };
  }
}
