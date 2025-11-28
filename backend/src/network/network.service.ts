import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import configuration from '../config/configuration';

@Injectable()
export class NetworkService {
  constructor(
    private readonly http: HttpService,
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
  ) {}

  async getStatus(customerId: string) {
    const url = `${this.config.networkService.baseUrl}/onu/${customerId}/status`;
    const response = await firstValueFrom(
      this.http.get(url, {
        headers: { 'x-internal-api-key': this.config.networkService.apiKey },
      }),
    );
    return response.data;
  }
}
