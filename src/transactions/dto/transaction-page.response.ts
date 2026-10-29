import { ApiProperty } from '@nestjs/swagger';
import { WalletTransactionKind } from './list-transactions.query';
import { TransactionResponseDto } from './transaction.response';

export class WalletTransactionDto extends TransactionResponseDto {
  @ApiProperty({
    enum: [
      WalletTransactionKind.Deposit,
      WalletTransactionKind.Swap,
      WalletTransactionKind.TransferIn,
      WalletTransactionKind.TransferOut,
    ],
    description: 'What this transaction was from the perspective of the wallet',
  })
  kind: WalletTransactionKind;
}

export class PageInfoDto {
  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: true })
  hasMore: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'MTI',
    description: 'Pass as `cursor` to fetch the next (older) page',
  })
  nextCursor: string | null;
}

export class TransactionPageDto {
  @ApiProperty({ type: [WalletTransactionDto] })
  data: WalletTransactionDto[];

  @ApiProperty({ type: PageInfoDto })
  pageInfo: PageInfoDto;
}
