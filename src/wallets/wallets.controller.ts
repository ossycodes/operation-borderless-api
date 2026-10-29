import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateWalletDto } from './dto/create-wallet.dto';
import {
  WalletBalancesResponseDto,
  WalletResponseDto,
} from './dto/wallet.response';
import { WalletsService } from './wallets.service';

@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a multi-currency wallet',
    description:
      'Identified by an email address and/or an E.164 mobile number. Each ' +
      'identifier can own only one wallet. A zero balance is opened for every ' +
      'supported stablecoin.',
  })
  @ApiCreatedResponse({ type: WalletResponseDto })
  @ApiConflictResponse({ description: 'WALLET_ALREADY_EXISTS' })
  async create(@Body() dto: CreateWalletDto): Promise<WalletResponseDto> {
    return WalletResponseDto.from(await this.wallets.create(dto));
  }

  @Get(':walletId')
  @ApiOperation({ summary: 'Get a wallet with its balances and USD total' })
  @ApiOkResponse({ type: WalletResponseDto })
  @ApiNotFoundResponse({ description: 'WALLET_NOT_FOUND' })
  async get(
    @Param('walletId', ParseUUIDPipe) walletId: string,
  ): Promise<WalletResponseDto> {
    return WalletResponseDto.from(await this.wallets.getWallet(walletId));
  }

  @Get(':walletId/balances')
  @ApiOperation({
    summary: 'Real-time balances per stablecoin plus the total in USD',
  })
  @ApiOkResponse({ type: WalletBalancesResponseDto })
  @ApiNotFoundResponse({ description: 'WALLET_NOT_FOUND' })
  async balances(
    @Param('walletId', ParseUUIDPipe) walletId: string,
  ): Promise<WalletBalancesResponseDto> {
    return WalletBalancesResponseDto.from(
      await this.wallets.getBalances(walletId),
    );
  }
}
