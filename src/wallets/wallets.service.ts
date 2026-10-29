import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Currency, SUPPORTED_CURRENCIES } from '../common/money/currency';
import { Dec, Money } from '../common/money/money';
import { isPgError, PgErrorCode } from '../database/pg-errors';
import { FxRatesService } from '../fx/fx-rates.service';
import type { RateSource } from '../fx/fx.types';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { WalletBalanceEntity } from './entities/wallet-balance.entity';
import { WalletEntity } from './entities/wallet.entity';
import { WalletAlreadyExistsError, WalletNotFoundError } from './wallet.errors';

export interface BalanceView {
  money: Money;
  usdValue: Money;
}

export interface WalletBalancesView {
  walletId: string;
  balances: BalanceView[];
  totalUsd: Decimal;
  rateSource: RateSource;
  ratesAsOf: string;
}

export interface WalletView {
  wallet: WalletEntity;
  portfolio: WalletBalancesView;
}

@Injectable()
export class WalletsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(WalletEntity)
    private readonly wallets: Repository<WalletEntity>,
    @InjectRepository(WalletBalanceEntity)
    private readonly balances: Repository<WalletBalanceEntity>,
    private readonly fxRates: FxRatesService,
  ) {}

  /**
   * Creates the wallet and a zero balance row for every supported currency
   * atomically. Uniqueness is enforced by partial unique indexes, so the
   * check is race-free.
   */
  async create(dto: CreateWalletDto): Promise<WalletView> {
    let wallet: WalletEntity;
    try {
      wallet = await this.dataSource.transaction(async (manager) => {
        const created = await manager.save(
          manager.create(WalletEntity, {
            email: dto.email ?? null,
            phoneNumber: dto.phoneNumber ?? null,
          }),
        );
        await manager.insert(
          WalletBalanceEntity,
          SUPPORTED_CURRENCIES.map((currency) => ({
            walletId: created.id,
            currency,
            amount: '0',
          })),
        );
        return created;
      });
    } catch (error) {
      if (isPgError(error, PgErrorCode.UniqueViolation, 'uq_wallets_email')) {
        throw new WalletAlreadyExistsError('email');
      }
      if (
        isPgError(error, PgErrorCode.UniqueViolation, 'uq_wallets_phone_number')
      ) {
        throw new WalletAlreadyExistsError('phoneNumber');
      }
      throw error;
    }
    return this.getWallet(wallet.id);
  }

  async getWallet(walletId: string): Promise<WalletView> {
    const wallet = await this.getOrFail(walletId);
    return { wallet, portfolio: await this.getBalances(walletId) };
  }

  async getBalances(walletId: string): Promise<WalletBalancesView> {
    await this.getOrFail(walletId);
    const [rows, rates] = await Promise.all([
      this.balances.find({ where: { walletId } }),
      this.fxRates.getRates(),
    ]);

    const byCurrency = new Map(rows.map((r) => [r.currency, r.amount]));
    const balances = SUPPORTED_CURRENCIES.map((currency): BalanceView => {
      const money = Money.of(currency, byCurrency.get(currency) ?? '0');
      const rate = this.fxRates.quoteFrom(rates, currency, Currency.USDx).rate;
      return { money, usdValue: money.convert(Currency.USDx, rate) };
    });

    const totalUsd = balances
      .reduce((sum, b) => sum.plus(b.usdValue.amount), new Dec(0))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

    return {
      walletId,
      balances,
      totalUsd,
      rateSource: rates.source,
      ratesAsOf: rates.asOf,
    };
  }

  async getOrFail(
    walletId: string,
    manager?: EntityManager,
  ): Promise<WalletEntity> {
    const repo = manager ? manager.getRepository(WalletEntity) : this.wallets;
    const wallet = await repo.findOne({ where: { id: walletId } });
    if (!wallet) throw new WalletNotFoundError(walletId);
    return wallet;
  }
}
