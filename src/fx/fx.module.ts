import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service';
import { FxProviderKind } from '../config/env.validation';
import { FxController } from './fx.controller';
import { FxRateCache } from './fx-rate.cache';
import { FxRateSnapshotEntity } from './fx-rate-snapshot.entity';
import { FxRatesService } from './fx-rates.service';
import {
  FX_QUEUE,
  FxRefreshProcessor,
  FxRefreshScheduler,
} from './fx-refresh.job';
import { PRIMARY_FX_PROVIDER } from './providers/fx-rate-provider';
import { OpenErApiProvider } from './providers/open-er-api.provider';
import { StaticRateProvider } from './providers/static-rate.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([FxRateSnapshotEntity]),
    BullModule.registerQueue({ name: FX_QUEUE }),
  ],
  controllers: [FxController],
  providers: [
    OpenErApiProvider,
    StaticRateProvider,
    {
      // Strategy selection happens once, at the composition root.
      provide: PRIMARY_FX_PROVIDER,
      inject: [AppConfigService, OpenErApiProvider, StaticRateProvider],
      useFactory: (
        config: AppConfigService,
        live: OpenErApiProvider,
        fixed: StaticRateProvider,
      ) => (config.fx.provider === FxProviderKind.Static ? fixed : live),
    },
    FxRateCache,
    FxRatesService,
    FxRefreshScheduler,
    FxRefreshProcessor,
  ],
  exports: [FxRatesService],
})
export class FxModule {}
