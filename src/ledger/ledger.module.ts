import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntryEntity } from './entities/ledger-entry.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { LedgerService } from './ledger.service';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionEntity, LedgerEntryEntity])],
  providers: [LedgerService],
  exports: [LedgerService, TypeOrmModule],
})
export class LedgerModule {}
