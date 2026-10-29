import { Injectable } from '@nestjs/common';
import { REQUIRED_FIAT_CODES, FiatCode } from '../../common/money/currency';
import { Dec } from '../../common/money/money';
import { AppConfigService } from '../../config/app-config.service';
import {
  FxProviderError,
  FxRateProvider,
  UsdRateTable,
} from './fx-rate-provider';

interface OpenErApiResponse {
  result?: string;
  base_code?: string;
  time_last_update_unix?: number;
  rates?: Record<string, unknown>;
}

/**
 * Live rates from https://open.er-api.com (free, no API key). The response
 * is treated as untrusted input and validated before use.
 */
@Injectable()
export class OpenErApiProvider implements FxRateProvider {
  readonly name = 'open.er-api.com';
  readonly source = 'live';

  constructor(private readonly config: AppConfigService) {}

  async fetchUsdRates(): Promise<UsdRateTable> {
    const { apiUrl, httpTimeoutMs } = this.config.fx;

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        signal: AbortSignal.timeout(httpTimeoutMs),
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      throw new FxProviderError(
        `FX provider unreachable: ${(error as Error).message}`,
      );
    }
    if (!response.ok) {
      throw new FxProviderError(`FX provider responded ${response.status}`);
    }

    const body = (await response.json()) as OpenErApiResponse;
    return this.parse(body);
  }

  private parse(body: OpenErApiResponse): UsdRateTable {
    if (body.result !== 'success' || body.base_code !== 'USD' || !body.rates) {
      throw new FxProviderError('FX provider returned an unexpected payload');
    }

    const rates = {} as Record<FiatCode, string>;
    for (const code of REQUIRED_FIAT_CODES) {
      const raw = body.rates[code];
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        throw new FxProviderError(
          `FX provider is missing a valid ${code} rate`,
        );
      }
      // Number -> string -> Decimal keeps the provider's printed digits exactly.
      rates[code] = new Dec(String(raw)).toString();
    }

    const asOf =
      typeof body.time_last_update_unix === 'number'
        ? new Date(body.time_last_update_unix * 1000)
        : new Date();

    return {
      provider: this.name,
      rates,
      asOf: asOf.toISOString(),
      fetchedAt: new Date().toISOString(),
    };
  }
}
